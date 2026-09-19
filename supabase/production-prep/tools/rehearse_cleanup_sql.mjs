// Phase 6.8 preparation: DRESS REHEARSAL of the generated cleanup SQL on a SCRATCH in-memory Postgres (PGlite). Never touches Supabase.
// Builds a scratch DB (migrations 0001-0021) loaded with the REAL row ids from results/dev_06 + dev_07 (foreign keys enforced), then:
//   T1 dry run passes and changes nothing | T2 execute + simulated Dashboard steps + post-verify all_ok
//   negatives (each must abort AND leave every row in place): extra row, missing row, same count / different id, legacy table present,
//   disabled trigger (post-check), owner not admin (post-check), storage object drift.
//   node rehearse_cleanup_sql.mjs <repoRoot>      (needs @electric-sql/pglite installed outside the repo - see README)
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const repo = process.argv[2];
const prep = path.join(repo, 'supabase/production-prep');
const rdir = path.join(prep, 'results');
const migDir = path.join(repo, 'supabase/migrations');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-sql-'));
execFileSync('node', [path.join(prep, 'tools/generate_cleanup_sql.mjs'), '--scratch', outDir], { stdio: 'pipe' });
const SQL = { dry: fs.readFileSync(path.join(outDir, '08a_cleanup_DRY_RUN.sql'), 'utf8'), exec: fs.readFileSync(path.join(outDir, '08b_cleanup_EXECUTE.sql'), 'utf8'), verify: fs.readFileSync(path.join(outDir, '10_post_dashboard_verify_readonly.sql'), 'utf8') };

const d6 = JSON.parse(fs.readFileSync(path.join(rdir, 'dev_06_data_inventory.json'), 'utf8'));
let d7 = JSON.parse(fs.readFileSync(path.join(rdir, 'dev_07_child_actors.json'), 'utf8')); if (d7.child_actor_inventory) d7 = d7.child_actor_inventory;
const e2i = Object.fromEntries(d6.profiles.map((p) => [p.id ? p.email : '', p.id]));
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const lit = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'boolean' || typeof v === 'number' ? String(v) : typeof v === 'object' ? q(JSON.stringify(v)) + '::jsonb' : q(v));
const ins = (table, rows) => rows.length ? rows.map((r) => `insert into ${table} (${Object.keys(r).join(',')}) values (${Object.values(r).map(lit).join(',')});`).join('\n') : '';
const rev = (arr, key) => Object.fromEntries(arr.map((x) => [x[key], x]));

const stub = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb default '{"provider":"email"}', email_confirmed_at timestamptz default now(), created_at timestamptz default now(), last_sign_in_at timestamptz, banned_until timestamptz, is_anonymous boolean default false);
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid, provider text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb, created_at timestamptz default now());
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

async function buildDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(stub);
  for (const f of fs.readdirSync(migDir).filter((x) => x.endsWith('.sql')).sort()) await db.exec('begin;\n' + fs.readFileSync(path.join(migDir, f), 'utf8') + '\ncommit;');
  await db.exec(d6.auth_users.map((u) => `insert into auth.users(id,email,created_at) values (${q(u.id)},${q(u.email)},${q(u.created_at)});`).join('\n'));   // trigger creates the profiles
  await db.exec(d6.profiles.map((p) => `update public.profiles set role=${q(p.role)}, approved=${p.approved}, active=${p.active}, display_name=${lit(p.display_name)} where id=${q(p.id)};`).join('\n'));
  const tables = (await db.query(`select tablename t from pg_tables where schemaname='public'`)).rows.map((r) => r.t);
  for (const t of tables) await db.exec(`alter table public.${t} disable trigger user;`);        // FK enforcement stays ON (system triggers)
  const P = 'public.';
  const rr = rev(d7.task_request_reviews, 'id'), pr = rev(d7.purchase_reviews, 'id'), cr = rev(d7.cad_reviewers, 'id');
  const script = [
    ins(P + 'subsystems', d6.subsystems), ins(P + 'subsystem_categories', d6.subsystem_categories), ins(P + 'timeline_columns', d6.timeline_columns),
    ins(P + 'timeline_milestones', d6.timeline_milestones), ins(P + 'competition_settings', d6.competition_settings), ins(P + 'recurring_events', d6.recurring_events),
    ins(P + 'milestones', d6.milestones),
    ins(P + 'subsystem_members', d6.subsystem_members.map((m) => ({ subsystem_id: m.subsystem_id, user_id: e2i[m.user_email], is_lead: m.is_lead }))),
    ins(P + 'tasks', d6.tasks.map((t) => ({ id: t.id, title: t.title, subsystem_id: t.subsystem_id, status: t.status, priority: t.priority, legacy_id: t.legacy_id, created_by: e2i[t.created_by], primary_owner_id: t.primary_owner ? e2i[t.primary_owner] : null, created_at: t.created_at }))),
    ins(P + 'task_assignees', d6.task_assignees.map((a) => ({ task_id: a.task_id, user_id: e2i[a.user_email], role: a.role }))),
    ins(P + 'task_requests', d6.task_requests.map((r) => ({ id: r.id, requester_id: e2i[r.requester], subsystem_id: r.subsystem_id, title: r.title, status: r.status, reviewed_by: rr[r.id]?.reviewed_by ? e2i[rr[r.id].reviewed_by] : null, reviewed_at: rr[r.id]?.reviewed_at || null, converted_task_id: r.converted_task_id, created_at: r.created_at }))),
    ins(P + 'task_comments', d6.task_comments.map((c) => ({ id: c.id, task_id: c.task_id, user_id: e2i[c.author], comment: 'x'.repeat(Math.max(1, c.length)), created_at: c.created_at }))),
    ins(P + 'comment_mentions', d7.comment_mentions.map((m) => ({ comment_id: m.comment_id, mentioned_profile_id: e2i[m.mentioned], created_at: m.created_at }))),
    ins(P + 'task_attachments', d6.task_attachments.map((a) => ({ id: a.id, task_id: a.task_id, uploaded_by: e2i[a.uploaded_by], file_name: a.file_name, storage_path: a.storage_path, file_size: a.file_size, created_at: a.created_at }))),
    ins(P + 'purchase_requests', d6.purchase_requests.map((p) => ({ id: p.id, subsystem_id: p.subsystem_id, requested_by: e2i[p.requested_by], title: p.title, status: p.status, legacy_id: p.legacy_id, reviewed_by: pr[p.id]?.reviewed_by ? e2i[pr[p.id].reviewed_by] : null, reviewed_at: pr[p.id]?.reviewed_at || null, created_at: p.created_at }))),
    ins(P + 'purchase_request_items', d7.purchase_request_items.map((i) => ({ id: i.id, purchase_request_id: i.purchase_request_id, description: i.description, quantity: i.quantity }))),
    ins(P + 'purchase_status_history', d7.purchase_status_history.map((h) => ({ id: h.id, purchase_request_id: h.purchase_request_id, from_status: h.from_status, to_status: h.to_status, changed_by: e2i[h.changed_by], changed_at: h.changed_at, note: h.note }))),
    ins(P + 'cad_reviews', d6.cad_reviews.map((c) => ({ id: c.id, subsystem_id: c.subsystem_id, title: c.title, status: c.status, submitted_by: e2i[c.submitted_by], reviewer_id: cr[c.id]?.reviewer ? e2i[cr[c.id].reviewer] : null, reviewed_at: cr[c.id]?.reviewed_at || null, current_revision: c.current_revision, task_id: c.task_id, created_at: c.created_at }))),
    ins(P + 'cad_review_versions', d7.cad_review_versions.map((v) => ({ id: v.id, cad_review_id: v.cad_review_id, revision_number: v.revision_number, submitted_by: e2i[v.submitted_by], created_at: v.created_at }))),
    ins(P + 'cad_review_comments', d7.cad_review_comments.map((c) => ({ id: c.id, cad_review_id: c.cad_review_id, user_id: e2i[c.author], comment: 'x'.repeat(Math.max(1, c.length)), created_at: c.created_at }))),
    ins(P + 'calendar_events', d6.calendar_events.map((e) => ({ id: e.id, title: e.title, start_time: e.start_time, end_time: e.start_time, subsystem_id: e.subsystem_id, active: e.active, created_by: e2i[e.created_by] }))),
    ins(P + 'member_applications', d6.member_applications.map((a) => ({ id: a.id, name: a.name, email: a.email, status: a.status, submitted_at: a.submitted_at, linked_profile_id: a.linked_profile_email ? e2i[a.linked_profile_email] : null, reviewed_by: a.reviewed_by ? e2i[a.reviewed_by] : null }))),
    ins(P + 'notifications', d7.notification_rows.map((n) => ({ id: n.id, user_id: e2i[n.user], type: n.type, title: 'n', entity_type: n.entity_type, entity_id: n.entity_id, read_at: n.read_at, created_at: n.created_at }))),
    ins(P + 'migration_exceptions', d6.migration_exceptions),
    d6.storage_objects.map((o) => `insert into storage.objects(bucket_id,name,metadata) values (${q(o.bucket)},${q(o.name)},${q(JSON.stringify({ size: Number(o.size), mimetype: o.mimetype }))}::jsonb);`).join('\n'),
  ].join('\n');
  await db.exec(script);
  for (const t of tables) await db.exec(`alter table public.${t} enable trigger user;`);
  return db;
}
const counts = async (db) => { const o = {}; for (const { t } of (await db.query(`select tablename t from pg_tables where schemaname='public' order by 1`)).rows) o[t] = Number((await db.query(`select count(*) c from public.${t}`)).rows[0].c); o['auth.users'] = Number((await db.query('select count(*) c from auth.users')).rows[0].c); o['storage.objects'] = Number((await db.query('select count(*) c from storage.objects')).rows[0].c); return o; };
const total = (c) => Object.entries(c).filter(([k]) => !k.includes('.')).reduce((a, [, v]) => a + v, 0);
const run = async (db, sql) => { try { const r = await db.exec(sql); return { ok: true, res: r }; } catch (e) { try { await db.exec('rollback;'); } catch {} return { ok: false, msg: String(e.message) }; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`); cond ? pass++ : fail++; };

// ---------------------------------------------------------------- build + fixture fidelity
let db = await buildDb();
const base = await counts(db);
const inv = d6.row_counts;
check('fixture built with REAL ids: every table count equals inventory 06', Object.keys(inv).every((t) => base[t] === Number(inv[t])), `${total(base)} rows in ${Object.keys(inv).length} tables`);
check('fixture: 4 auth users, 2 storage objects', base['auth.users'] === 4 && base['storage.objects'] === 2);

console.log('\nT1  DRY RUN on the fixture');
let r = await run(db, SQL.dry);
check('dry run passes (guard + precondition + deletes + post-checks)', r.ok, r.msg?.slice(0, 200));
check('dry run rolled everything back (all counts identical)', same(await counts(db), base));

console.log('\nNEGATIVE TESTS (each must abort and leave every row in place)');
async function negative(name, mutate, expectText) {
  const d = await buildDb(); const b = await counts(d);
  await mutate(d);
  const before = await counts(d);
  const res = await run(d, SQL.exec);
  const after = await counts(d);
  check(name, !res.ok && (!expectText || res.msg.includes(expectText)) && same(before, after), res.ok ? 'DID NOT ABORT' : res.msg.replace(/\s+/g, ' ').slice(0, 130));
}
await negative('N1 extra row appears (drift)', async (d) => { await d.exec(`alter table public.tasks disable trigger user; insert into public.tasks(id,title,subsystem_id,created_by) values (gen_random_uuid(),'new real task','${d6.subsystems[0].id}','${d6.profiles[1].id}'); alter table public.tasks enable trigger user;`); }, 'precondition');
await negative('N2 a row is missing (drift)', async (d) => { await d.exec(`delete from public.notifications where id = (select id from public.notifications limit 1)`); }, 'precondition');
await negative('N3 SAME count but a different id (fingerprint catches it)', async (d) => { await d.exec(`update public.notifications set id = gen_random_uuid() where id = (select id from public.notifications limit 1)`); }, 'DIFFERENT rows');
await negative('N4 legacy table present => looks like the OLD project (guard)', async (d) => { await d.exec(`create table public.workspace_state (id text primary key)`); }, 'guard');
await negative('N5 owner is not admin (post-check rolls the deletes back)', async (d) => { await d.exec(`update public.profiles set role='member' where id='${d6.profiles.find((p) => !/@bobcat-test/.test(p.email)).id}'`); }, 'post-check');
await negative('N6 a trigger is disabled (post-check rolls the deletes back)', async (d) => { await d.exec(`alter table public.tasks disable trigger tasks_before_write`); }, 'post-check');
await negative('N7 storage drift (a third file appears)', async (d) => { await d.exec(`insert into storage.objects(bucket_id,name,metadata) values ('task-attachments','extra/file.png','{"size":1,"mimetype":"image/png"}')`); }, 'precondition');
await negative('N8 owner account missing from auth (guard)', async (d) => { await d.exec(`set session_replication_role = replica; delete from auth.users where id = '${d6.profiles.find((p) => !/@bobcat-test/.test(p.email)).id}'; set session_replication_role = origin;`); }, 'guard');

console.log('\nT2  EXECUTE on the fixture, then the simulated Dashboard steps');
db = await buildDb();
r = await run(db, SQL.exec);
check('execute passes and commits', r.ok, r.msg?.slice(0, 200));
const after = await counts(db);
const nonProfile = Object.entries(after).filter(([k, v]) => !k.includes('.') && k !== 'profiles' && v !== 0);
check('all 26 data tables are empty', nonProfile.length === 0, JSON.stringify(nonProfile));
check('profiles / auth.users / storage.objects untouched by the SQL (4 / 4 / 2)', after.profiles === 4 && after['auth.users'] === 4 && after['storage.objects'] === 2);
const deleted = total(base) - total(after);
check('SQL deleted exactly the approved 225 rows', deleted === 225, `deleted ${deleted}`);
const v0 = (await db.query(SQL.verify)).rows[0].post_dashboard_verification;
check('10_post_dashboard_verify is NOT all_ok yet (Dashboard steps pending)', v0.all_ok === false, `auth_users=${v0.auth_users}, storage_objects=${v0.storage_objects}`);
await db.exec(`delete from storage.objects`);                                         // Dashboard step A (2 files)
await db.exec(`delete from auth.users where email like '%@bobcat-test.dev'`);         // Dashboard step B (3 users; profiles cascade)
const v1 = (await db.query(SQL.verify)).rows[0].post_dashboard_verification;
check('after Dashboard steps: 10_post_dashboard_verify all_ok = true', v1.all_ok === true, JSON.stringify(v1));
const fin = await counts(db);
check('final state: 1 auth user, 1 profile, 0 storage objects, bucket + policies kept', fin['auth.users'] === 1 && fin.profiles === 1 && fin['storage.objects'] === 0 && v1.bucket_present === 1 && v1.storage_policies === 2);
check('total removed = 233 (225 SQL + 3 users + 3 profiles + 2 files)', (total(base) + 4 + 2) - (total(fin) + fin['auth.users'] + fin['storage.objects']) === 233, `${(total(base) + 4 + 2) - (total(fin) + fin['auth.users'] + fin['storage.objects'])}`);

console.log(`\n${fail === 0 ? 'ALL' : 'SOME'} CHECKS: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

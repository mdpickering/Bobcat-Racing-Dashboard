// Phase 6.8 preparation: FULL-PIPELINE REHEARSAL of the legacy data import on SCRATCH in-memory Postgres (PGlite). Never touches Supabase.
//   synthetic legacy DB (real-shaped, fake values, fake PINs) -> 30_extract (read-only) -> validate_source_export -> generate_import_sql
//   -> import into a scratch copy of the POST-CLEANUP bobcat-dev (migrations 0001-0021 + only the owner's account).
// Checks: dry run changes nothing; execute imports exactly the independently-computed expectation; D3/D4/PIN/notification/attribution/profile rules;
//         the mapped-purchase path (with an explicit alias); negative tests (each must abort and leave the target EMPTY).
//   node rehearse_import.mjs <repoRoot>      (needs @electric-sql/pglite installed outside the repo - see README)
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const repo = process.argv[2];
const prep = path.join(repo, 'supabase/production-prep');
const migDir = path.join(repo, 'supabase/migrations');
const { buildSynthetic, LEGACY_DDL, legacyInsertSql } = await import('file:///' + prep.replace(/\\/g, '/') + '/tools/synthetic_legacy.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'import-rehearsal-'));
const OWNER = 'f15d8647-6a00-493a-8c07-1070f9a66b9b';
const PINS = ['1000', '1111', '1222', '1333', '1444', '1555', '1666'];
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + String(extra).slice(0, 900) : ''}`); cond ? pass++ : fail++; };

// ---------- 1) synthetic legacy DB -> extraction -> validation
const legacy = new PGlite(); await legacy.exec(LEGACY_DDL); await legacy.exec(legacyInsertSql(buildSynthetic()));
const exp = (await legacy.query(fs.readFileSync(path.join(prep, 'import/30_extract_legacy_source_readonly.sql'), 'utf8'))).rows[0].source_export;
const exportFile = path.join(tmp, 'prod_30_source_export.json'); fs.writeFileSync(exportFile, JSON.stringify(exp));
console.log('\nSTAGE 1  extraction + validation');
check('extraction output contains no PIN value and no leadPin key', !/leadPin/.test(JSON.stringify(exp)) && !PINS.some((p) => JSON.stringify(exp).includes(`"${p}"`)));
let v; try { v = execFileSync('node', [path.join(prep, 'tools/validate_source_export.mjs'), exportFile], { encoding: 'utf8' }); } catch (e) { v = String(e.stdout); }
check('validator accepts it (usable; drift warning expected: the data is synthetic)', /RESULT: USABLE WITH/.test(v) && !/BLOCK/.test(v));

// ---------- 2) generate
const gen = (dirName, extra = []) => { const out = path.join(tmp, dirName); execFileSync('node', [path.join(prep, 'tools/generate_import_sql.mjs'), '--export', exportFile, '--importer', OWNER, '--out', out, '--accept-drift', '--scratch', ...extra], { encoding: 'utf8' }); return { dry: fs.readFileSync(path.join(out, '40a_import_DRY_RUN.sql'), 'utf8'), exec: fs.readFileSync(path.join(out, '40b_import_EXECUTE.sql'), 'utf8'), expected: JSON.parse(fs.readFileSync(path.join(out, 'expected.json'), 'utf8')) }; };
const base = gen('base');
check('generator refuses a drifted export without --accept-drift', (() => { try { execFileSync('node', [path.join(prep, 'tools/generate_import_sql.mjs'), '--export', exportFile, '--importer', OWNER, '--out', path.join(tmp, 'x')], { stdio: 'pipe' }); return false; } catch { return true; } })());
console.log('  expected (independent JS computation):', JSON.stringify({ tasks: base.expected.expected.tasks, held: base.expected.held_tasks, purchases: base.expected.expected.purchase_requests }), '| exceptions', JSON.stringify(base.expected.expected.exceptions_by_type));

// ---------- 3) scratch bobcat-dev (post-cleanup state: schema + only the owner)
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
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`;
async function target() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(stub);
  for (const f of fs.readdirSync(migDir).filter((x) => x.endsWith('.sql')).sort()) await db.exec('begin;\n' + fs.readFileSync(path.join(migDir, f), 'utf8') + '\ncommit;');
  await db.exec(`insert into auth.users(id,email) values ('${OWNER}','owner@example.test'); update public.profiles set role='admin', approved=true, active=true, display_name='Owner' where id='${OWNER}';`);
  return db;
}
const dataTables = async (db) => (await db.query(`select tablename t from pg_tables where schemaname='public' and tablename<>'profiles' order by 1`)).rows.map((r) => r.t);
const total = async (db) => { let n = 0; for (const t of await dataTables(db)) n += Number((await db.query(`select count(*) c from public.${t}`)).rows[0].c); return n; };
const run = async (db, sql) => { try { await db.exec(sql); return { ok: true }; } catch (e) { try { await db.exec('rollback;'); } catch {} return { ok: false, msg: String(e.message).replace(/\s+/g, ' ') }; } };
const one = async (db, sql) => (await db.query(sql)).rows[0];
const owner0 = async (db) => (await one(db, `select md5(to_jsonb(p)::text) m from public.profiles p where id='${OWNER}'`)).m;

console.log('\nSTAGE 2  DRY RUN on the scratch bobcat-dev');
let db = await target(); const m0 = await owner0(db);
let r = await run(db, base.dry);
check('dry run passes (guards + import + independent-expectation post-checks)', r.ok, r.msg);
check('dry run rolled back: every data table is empty again, owner profile identical', (await total(db)) === 0 && (await owner0(db)) === m0);

console.log('\nSTAGE 3  EXECUTE');
r = await run(db, base.exec);
check('execute passes and commits', r.ok, r.msg);
const E = base.expected.expected;
check('subsystems: 7 with the original text ids preserved', (await one(db, `select count(*) c, string_agg(id, ',' order by id) s from public.subsystems`)).s === 'drivetrain-fitment,fabrication,front-suspension,pedals-driver-controls,rear-suspension-brakes,sae-deliverables,shielding-safety');
check('categories: 25, each in its own subsystem', Number((await one(db, `select count(*) c from public.subsystem_categories`)).c) === 25);
const br = await one(db, `select label, highlight, sort_order from public.timeline_columns where key='BREAK'`), w3 = await one(db, `select highlight from public.timeline_columns where key='W3'`);
check('timeline: key BREAK kept with label W8 at position 8; emerald -> highlighted (only W3)', br.label === 'W8' && br.sort_order === 8 && br.highlight === false && w3.highlight === true && E.timeline_columns_highlighted === 1);
check('timeline cells: 5 (all W4), recurring event Tue 12:30 navy', Number((await one(db, `select count(*) c from public.timeline_milestones where timeline_column_key='W4'`)).c) === 5 && (await one(db, `select day_of_week d, time_label t, color c from public.recurring_events`)).c === 'navy');
check(`tasks: ${E.tasks} imported = union, held ${base.expected.held_tasks}, imported + held = 69`, Number((await one(db, `select count(*) c from public.tasks`)).c) === E.tasks && E.tasks + base.expected.held_tasks === 69, `${E.tasks} + ${base.expected.held_tasks}`);
const t18 = await one(db, `select t.title, t.subsystem_id, t.created_at, t.created_by from public.tasks t where legacy_id='t18'`);
const wsT18 = buildSynthetic().workspace_state.tasks.find((t) => t.id === 't18');
check('D3: overlapping id t18 takes the workspace_state values (title + subsystem), relational created_at kept', t18.title === wsT18.title && t18.subsystem_id === wsT18.subsystemId && new Date(t18.created_at).toISOString().startsWith('2026-08-20'), `${t18.subsystem_id} / ${new Date(t18.created_at).toISOString()}`);
check('imported tasks keep legacy_id, are attributed to the importer, have NO owner', Number((await one(db, `select count(*) c from public.tasks where legacy_id is null or created_by <> '${OWNER}' or primary_owner_id is not null`)).c) === 0);
const dl = await one(db, `select (deadline at time zone 'UTC')::text d from public.tasks where deadline is not null order by legacy_id limit 1`);
check('deadlines stored as midnight UTC (the app convention)', /00:00:00$/.test(dl.d), dl.d);
check('Complete task has completed_at; others do not', Number((await one(db, `select count(*) c from public.tasks where (status='Complete') <> (completed_at is not null)`)).c) === 0);
check('raw legacy assignee preserved on tasks', Number((await one(db, `select count(*) c from public.tasks where legacy_assignee_raw is not null`)).c) === E.tasks_with_assignee_raw && E.tasks_with_assignee_raw > 0);
const held = await one(db, `select count(*) c, count(*) filter (where context->'record'->>'title' is not null and context->>'unmapped_value' in ('chassis','brakes','rear-suspension')) full from public.migration_exceptions where entity_type='task_unmapped_subsystem'`);
check('D4: chassis/brakes/rear-suspension tasks are held with the COMPLETE legacy record, never guessed', Number(held.c) === 5 && Number(held.full) === 5, JSON.stringify(held));
check('D4: both chassis orders held as exceptions; NO purchase rows created', Number((await one(db, `select count(*) c from public.migration_exceptions where entity_type='purchase_request_unmapped_subsystem' and context->'record'->>'vendor_url' is not null`)).c) === 2 && Number((await one(db, `select count(*) c from public.purchase_requests`)).c) === 0);
check('the fake lead PINs appear NOWHERE in the target (tasks, exceptions, log)', Number((await one(db, `select count(*) c from public.migration_exceptions where ${PINS.map((p) => `context::text like '%"${p}"%'`).join(' or ')}`)).c) === 0 && Number((await one(db, `select count(*) c from public.migration_exceptions where context::text ~* 'leadpin'`)).c) === 0);
check('leads/members recorded as unresolved people exceptions (no accounts)', Number((await one(db, `select count(*) c from public.migration_exceptions where entity_type in ('subsystem_lead','subsystem_member') and resolution_status='unresolved'`)).c) === (E.exceptions_by_type.subsystem_lead + E.exceptions_by_type.subsystem_member));
check('NO notifications were created (spam prevented) and all triggers are enabled again', Number((await one(db, `select count(*) c from public.notifications`)).c) === 0 && Number((await one(db, `select count(*) c from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and t.tgenabled<>'O' and c.relnamespace='public'::regnamespace`)).c) === 0);
check('owner profile row NOT modified; still exactly 1 profile / 1 auth user', (await owner0(db)) === m0 && Number((await one(db, `select count(*) c from public.profiles`)).c) === 1);
const log = await one(db, `select count(*) filter (where entity_type='task') tasks, count(*) filter (where entity_type='task_relational_superseded') sup, count(*) filter (where entity_type='order') ord, count(*) filter (where entity_type='workspace_state') ws from public.migration_log`);
check('migration_log covers every legacy record (69 tasks, 10 superseded, 2 orders, the document)', Number(log.tasks) === 69 && Number(log.sup) === 10 && Number(log.ord) === 2 && Number(log.ws) === 1, JSON.stringify(log));
const v41 = (await one(db, fs.readFileSync(path.join(prep, 'import/41_post_import_verify_readonly.sql'), 'utf8'))).post_import_verification;
check('41_post_import_verify_readonly returns all_ok = true', v41.all_ok === true, JSON.stringify(v41).slice(0, 120));
r = await run(db, base.exec);
check('re-running the import is refused (not idempotent by design)', !r.ok && /precondition/.test(r.msg), r.msg?.slice(0, 90));

console.log('\nSTAGE 4  MAPPED-PURCHASE PATH (an explicit alias chassis -> fabrication; NOT part of the initial import)');
const al = gen('alias', ['--aliases', '{"chassis":"fabrication"}']);
db = await target(); r = await run(db, al.exec);
check('alias variant passes its independent expectation', r.ok, r.msg);
const p = (await db.query(`select r.status, r.legacy_status_raw, r.legacy_id, r.description, r.requested_by, i.quantity, i.notes, i.link, h.to_status, h.from_status, h.note, h.changed_by from public.purchase_requests r join public.purchase_request_items i on i.purchase_request_id=r.id join public.purchase_status_history h on h.purchase_request_id=r.id order by r.legacy_id`)).rows;
check('orders imported: Requested -> Submitted, Arrived in Shop -> Arrived in Shop, raw status kept', p.length === 2 && p[0].status === 'Submitted' && p[0].legacy_status_raw === 'Requested' && p[1].status === 'Arrived in Shop' && p[1].legacy_status_raw === 'Arrived in Shop', JSON.stringify(p.map((x) => [x.status, x.legacy_status_raw])));
check('purchase details: urgency/requester in description, part # in item notes, link kept, history from NULL, importer attribution', /Urgency: Immediate Need/.test(p[0].description) && /Legacy requester: Person A/.test(p[0].description) && /^Part #: PN-/.test(p[0].notes) && p[0].link && p[0].from_status === null && p[0].to_status === 'Submitted' && p.every((x) => x.requested_by === OWNER && x.changed_by === OWNER));
check('unmapped brakes/rear-suspension tasks stay held even with the chassis alias (no guessing)', Number((await one(db, `select count(*) c from public.migration_exceptions where entity_type='task_unmapped_subsystem'`)).c) === 2);
check('still no notifications', Number((await one(db, `select count(*) c from public.notifications`)).c) === 0);

console.log('\nSTAGE 5  NEGATIVE TESTS (each must abort and leave the target EMPTY)');
async function neg(name, mutateDb, sqlOf, expectText) {
  const d = await target(); if (mutateDb) await mutateDb(d);
  const beforeTotal = await total(d), res = await run(d, sqlOf(base));
  check(name, !res.ok && (!expectText || res.msg.includes(expectText)) && (await total(d)) === beforeTotal, res.ok ? 'DID NOT ABORT' : res.msg.slice(0, 110));
}
const payloadOf = (sql) => sql.match(/\$legacy\$([\s\S]*?)\$legacy\$/)[1];
await neg('N1 payload tampered after generation (md5 guard)', null, (b) => b.exec.replace('"Task 1 ', '"Task ONE '), 'payload');
await neg('N2 target already has data (clean-state precondition)', async (d) => { await d.exec(`insert into public.subsystems(id,name) values ('x','X')`); }, (b) => b.exec, 'precondition');
await neg('N3 legacy table present => OLD project (guard)', async (d) => { await d.exec(`create table public.workspace_state (id text primary key)`); }, (b) => b.exec, 'guard');
await neg('N4 importer is not an approved admin/cto (importer guard)', async (d) => { await d.exec(`update public.profiles set role='member' where id='${OWNER}'`); }, (b) => b.exec, 'importer');
await neg('N5 a second account exists (not the post-cleanup state)', async (d) => { await d.exec(`insert into auth.users(id,email) values (gen_random_uuid(),'other@example.test')`); }, (b) => b.exec, 'precondition');
await neg('N6 a trigger is already disabled (precondition)', async (d) => { await d.exec(`alter table public.tasks disable trigger tasks_before_write`); }, (b) => b.exec, 'precondition');
await neg('N7 payload smuggles a leadPin (even with a matching md5)', null, (b) => { const p = payloadOf(b.exec); const p2 = p.replace('"lead":"Lead Alpha"', '"lead":"Lead Alpha","leadPin":"1234"'); return b.exec.replace(p, p2).split(base.expected.payload_md5).join(crypto.createHash('md5').update(p2).digest('hex')); }, 'leadPin');
await neg('N8 independent expectation disagrees with the SQL result (post-check)', null, (b) => b.exec.replace(/"tasks":\d+,"tasks_complete"/, `"tasks":${E.tasks + 1},"tasks_complete"`), 'post-check');
await neg('N9 corrupted JSON (never partially imports)', null, (b) => b.exec.replace('"subsystem_aliases"', '"subsystem_aliases').replace('"workspace_state":{"id"', '"workspace_state":{"id" BROKEN'), '');

console.log('\nSTAGE 6  GENERATOR HARDENING (the placeholder-leak fix: no template marker may ever reach a generated file)');
const tplSrc = fs.readFileSync(path.join(prep, 'import/40_import_TEMPLATE_DO_NOT_RUN.sql'), 'utf8');
{ const res = await run(new PGlite(), tplSrc); check('the TEMPLATE parses and stops with a clear message (never a cryptic syntax error)', !res.ok && /THIS IS THE TEMPLATE/.test(res.msg) && !/syntax error/i.test(res.msg), res.msg?.slice(0, 90)); }
const genPath = path.join(prep, 'tools/generate_import_sql.mjs');
const genWith = (name, tplText, exportPath = exportFile, seedStale = false) => {
  const tp = path.join(tmp, name + '.template.sql'); fs.writeFileSync(tp, tplText); const out = path.join(tmp, name);
  if (seedStale) { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, '40a_import_DRY_RUN.sql'), '-- STALE FILE FROM AN EARLIER RUN'); }
  let code = 0, msg = ''; try { execFileSync('node', [genPath, '--export', exportPath, '--importer', OWNER, '--out', out, '--accept-drift', '--scratch', '--template', tp], { stdio: 'pipe' }); } catch (e) { code = e.status; msg = String(e.stderr); }
  return { code, msg, out, files: fs.existsSync(out) ? fs.readdirSync(out) : [] };
};
let gr = genWith('bug1', tplSrc.replace('-- @@MODE_END@@', '__MODE_END__'), exportFile, true);
check('the ORIGINAL DEFECT (a bare __MODE_END__ in the template) is REFUSED, and a stale file from an earlier run is removed', gr.code !== 0 && gr.files.length === 0, gr.msg.replace(/\s+/g, ' ').slice(0, 110));
gr = genWith('bug2', tplSrc.replace('begin;\n', 'begin;\n-- __STRAY_MARKER__\n'));
check('any other stray __X__ marker is REFUSED and leaves no file', gr.code !== 0 && gr.files.length === 0, gr.msg.replace(/\s+/g, ' ').slice(0, 110));
gr = genWith('bug3', tplSrc.replace('-- @@TEMPLATE_GUARD_BEGIN', '-- keep this comment'));
check('a template guard that could not be stripped is REFUSED and leaves no file', gr.code !== 0 && gr.files.length === 0, gr.msg.replace(/\s+/g, ' ').slice(0, 110));
gr = genWith('bug4', tplSrc.replace('__IMPORTER__', '00000000-0000-4000-8000-000000000000').replace('__IMPORTER__', '11111111-1111-4111-8111-111111111111'));
check('two different importer ids in one file are REFUSED', gr.code !== 0 && gr.files.length === 0, gr.msg.replace(/\s+/g, ' ').slice(0, 110));
gr = genWith('good', tplSrc);
check('the real template generates cleanly: 3 files, static checks pass', gr.code === 0 && gr.files.length === 3, gr.msg.slice(0, 100));
// a value that looks like a JavaScript replacement pattern must reach the SQL unchanged
const ex2 = JSON.parse(JSON.stringify(exp)); const weird = "Cost $& and $' and $1 and $$ and \\ backslash and __PAYLOAD__ __EXPECT__ __IMPORTER__ inside DATA";
ex2.workspace_state.tasks[0].title = weird; const f2 = path.join(tmp, 'dollar.json'); fs.writeFileSync(f2, JSON.stringify(ex2));
gr = genWith('dollar', tplSrc, f2);
check('a legacy value containing $& $\' $1 $$ and marker-LIKE text (__PAYLOAD__ __EXPECT__ __IMPORTER__) is embedded UNCHANGED (data is never re-scanned)', gr.code === 0, gr.msg.replace(/\s+/g, ' ').slice(0, 120));
const ex3 = JSON.parse(JSON.stringify(exp)); ex3.workspace_state.tasks[0].title = 'contains __MODE_END__ literally'; const f3 = path.join(tmp, 'modeend-data.json'); fs.writeFileSync(f3, JSON.stringify(ex3));
const gr3 = genWith('modeenddata', tplSrc, f3);
check('conservative rule: data that contains the literal __MODE_END__ is REFUSED (neither generated file may contain that string)', gr3.code !== 0 && gr3.files.length === 0, gr3.msg.replace(/\s+/g, ' ').slice(0, 110));
if (gr.code === 0) {
  db = await target(); r = await run(db, fs.readFileSync(path.join(gr.out, '40b_import_EXECUTE.sql'), 'utf8'));
  const tt = await one(db, `select title from public.tasks where legacy_id='${ex2.workspace_state.tasks[0].id}'`);
  check('...and after the import the title is byte-identical to the source', r.ok && tt.title === weird, r.msg || tt.title);
}

console.log(`\n${fail === 0 ? 'ALL' : 'SOME'} CHECKS: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

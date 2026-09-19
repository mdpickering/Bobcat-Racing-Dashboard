// Phase 6.8 preparation tool: REHEARSE the bobcat-dev test-data cleanup on a SCRATCH in-memory Postgres (PGlite).
// It never connects to any Supabase project. It (1) applies migrations 0001-0021 to a clean scratch DB,
// (2) fills EVERY table with fixture data owned by 3 "test" accounts plus 1 "owner" account that must survive,
// (3) validates 06_inventory_dev_data_readonly.sql against that fixture, (4) derives a foreign-key-safe deletion order
// from the real bobcat-dev constraints (results/dev_01_inventory.json, else the scratch inventory), (5) shows the naive order
// FAILS, (6) runs the safe order in one transaction, (7) proves only the owner's profile remains and the schema is
// byte-identical before/after (est_rows ignored).
//   node rehearse_cleanup.mjs <repoRoot>      (setup: see README — needs @electric-sql/pglite installed outside the repo)
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
import path from 'node:path';

const repo = process.argv[2];
const prep = path.join(repo, 'supabase/production-prep');
const migDir = path.join(repo, 'supabase/migrations');
const inspect = fs.readFileSync(path.join(prep, '01_inspect_schema_readonly.sql'), 'utf8');
const inv06 = fs.readFileSync(path.join(prep, '06_inventory_dev_data_readonly.sql'), 'utf8');
fs.mkdirSync('out', { recursive: true });

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb default '{"provider":"email"}',
  email_confirmed_at timestamptz default now(), created_at timestamptz default now(), last_sign_in_at timestamptz, banned_until timestamptz, is_anonymous boolean default false);
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
`);
for (const f of fs.readdirSync(migDir).filter(f => f.endsWith('.sql')).sort()) await db.exec('begin;\n' + fs.readFileSync(path.join(migDir, f), 'utf8') + '\ncommit;');
console.log('scratch DB ready: migrations 0001-0021 applied');

const O = 'aaaaaaaa-0000-4000-8000-000000000001', T1 = 'aaaaaaaa-0000-4000-8000-000000000002', T2 = 'aaaaaaaa-0000-4000-8000-000000000003', T3 = 'aaaaaaaa-0000-4000-8000-000000000004';
await db.exec(`insert into auth.users(id,email) values ('${O}','owner@quinnipiac.edu'),('${T1}','member1@bobcat-test.dev'),('${T2}','lead1@bobcat-test.dev'),('${T3}','cto1@bobcat-test.dev');
  update public.profiles set approved=true, role='cto' where id in ('${O}','${T3}');
  update public.profiles set approved=true, role='team_lead' where id='${T2}';
  update public.profiles set approved=true where id='${T1}';`);
// fixture rows in EVERY table (user triggers off only while loading the fixture, so attribution stays as written)
await db.exec(`set session_replication_role = replica;
insert into public.subsystems(id,name) values ('test-a','Test A'),('test-b','Test B');
insert into public.subsystem_categories(id,subsystem_id,name) values ('bbbbbbbb-0000-4000-8000-000000000001','test-a','Cat');
insert into public.subsystem_members(subsystem_id,user_id,is_lead) values ('test-a','${T1}',true),('test-b','${T2}',false),('test-a','${T3}',false);
insert into public.tasks(id,title,subsystem_id,category_id,created_by,primary_owner_id,legacy_id) values
 ('cccccccc-0000-4000-8000-000000000001','probe','test-a','bbbbbbbb-0000-4000-8000-000000000001','${T3}','${T1}','L1'),
 ('cccccccc-0000-4000-8000-000000000002','t2','test-b',null,'${T3}',null,null);
insert into public.task_assignees(task_id,user_id,role) values ('cccccccc-0000-4000-8000-000000000001','${T1}','primary');
insert into public.task_requests(id,requester_id,subsystem_id,title,status,converted_task_id) values ('dddddddd-0000-4000-8000-000000000001','${T1}','test-a','req','approved','cccccccc-0000-4000-8000-000000000001');
insert into public.task_comments(id,task_id,user_id,comment) values ('eeeeeeee-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000001','${T2}','a comment');
insert into public.comment_mentions(comment_id,mentioned_profile_id) values ('eeeeeeee-0000-4000-8000-000000000001','${T1}');
insert into public.task_attachments(id,task_id,uploaded_by,file_name,storage_path,file_size) values
 ('ffffffff-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000001','${T1}','real.png','cccccccc-0000-4000-8000-000000000001/1-real.png',10),
 ('ffffffff-0000-4000-8000-000000000002','cccccccc-0000-4000-8000-000000000001','${T1}','stub.png','cccccccc-0000-4000-8000-000000000001/2-stub.png',10);
insert into storage.buckets(id,name) values ('task-attachments','task-attachments') on conflict do nothing;
insert into storage.objects(bucket_id,name,metadata) values ('task-attachments','cccccccc-0000-4000-8000-000000000001/1-real.png','{"size":10,"mimetype":"image/png"}');
insert into public.purchase_requests(id,subsystem_id,requested_by,title,status) values ('11111111-0000-4000-8000-000000000001','test-a','${T2}','p','Approved');
insert into public.purchase_request_items(purchase_request_id,description) values ('11111111-0000-4000-8000-000000000001','bolt');
insert into public.purchase_status_history(purchase_request_id,to_status,changed_by) values ('11111111-0000-4000-8000-000000000001','Approved','${T3}');
insert into public.cad_reviews(id,subsystem_id,title,submitted_by,task_id) values ('22222222-0000-4000-8000-000000000001','test-a','cad','${T1}','cccccccc-0000-4000-8000-000000000001');
insert into public.cad_review_versions(cad_review_id,revision_number,submitted_by) values ('22222222-0000-4000-8000-000000000001',1,'${T1}');
insert into public.cad_review_comments(cad_review_id,user_id,comment) values ('22222222-0000-4000-8000-000000000001','${T2}','cc');
insert into public.calendar_events(title,start_time,end_time,created_by) values ('ev',now(),now(),'${T3}');
insert into public.recurring_events(title,day_of_week) values ('rec',2);
insert into public.milestones(name,date) values ('ms',current_date);
insert into public.timeline_columns(key,label,sort_order) values ('W1','W1',1);
insert into public.timeline_milestones(subsystem_id,timeline_column_key,milestone_text,updated_by) values ('test-a','W1','x','${T3}');
insert into public.competition_settings(season) values ('2026');
insert into public.notifications(user_id,type,title) values ('${T1}','task_assignment','n1'),('${T3}','x','n2');
insert into public.member_applications(name,email,linked_profile_id,reviewed_by) values ('App One','app@x.test','${T1}','${T3}');
insert into public.migration_exceptions(migration_batch_id,entity_type,raw_value,resolved_to_profile_id) values (gen_random_uuid(),'test','raw','${T1}');
insert into public.migration_log(migration_batch_id,entity_type,legacy_id_or_key,status) values (gen_random_uuid(),'t','k','migrated');
insert into public.audit_logs(user_id,action) values ('${T3}','x');
set session_replication_role = origin;`);

const counts = async () => Object.fromEntries((await db.query(`select tablename t from pg_tables where schemaname='public' order by 1`)).rows
  .map(r => [r.t, null]).map(([t]) => [t, null]));
const rowCounts = async () => { const out = {}; for (const { t } of (await db.query(`select tablename t from pg_tables where schemaname='public' order by 1`)).rows) out[t] = Number((await db.query(`select count(*) c from public.${t}`)).rows[0].c); return out; };
const before = await rowCounts();
console.log('\nfixture row counts (tables with data):', Object.entries(before).filter(([, n]) => n > 0).map(([t, n]) => `${t}=${n}`).join(' '));

// --- (3) validate the inventory script against the fixture
const i06 = (await db.query(inv06)).rows[0].dev_data_inventory;
fs.writeFileSync('out/fixture_06.json', JSON.stringify(i06, null, 1));
const cnt06 = i06.row_counts;
console.log('06 ran OK. auth_users:', i06.auth_users.length, '| profiles:', i06.profiles.length, '| exact row_counts match fixture:',
  Object.keys(before).every(t => Number(cnt06[t]) === before[t]));
console.log('06 flags attachment rows without a file:', i06.task_attachments.filter(a => !a.has_storage_object).map(a => a.file_name).join(','),
  '| storage objects:', i06.storage_objects.length);

// --- (3b) validate 07_child_rows_actors_readonly.sql against the same fixture
const i07 = (await db.query(fs.readFileSync(path.join(prep, '07_child_rows_actors_readonly.sql'), 'utf8'))).rows[0].child_actor_inventory;
console.log('07 ran OK. row-level counts vs fixture: history', i07.purchase_status_history.length === before.purchase_status_history,
  '| items', i07.purchase_request_items.length === before.purchase_request_items,
  '| cad versions', i07.cad_review_versions.length === before.cad_review_versions,
  '| cad comments', i07.cad_review_comments.length === before.cad_review_comments,
  '| mentions', i07.comment_mentions.length === before.comment_mentions,
  '| notifications', i07.notification_rows.length === before.notifications);

// --- (4) FK-safe deletion order from the real dev constraints
const devPath = path.join(prep, 'results/dev_01_inventory.json');
let inv;
try { inv = JSON.parse(fs.readFileSync(devPath, 'utf8')); if (!inv.constraints) throw 0; console.log('\nFK graph source: REAL bobcat-dev inventory'); }
catch { inv = (await db.query(inspect)).rows[0].inventory; console.log('\nFK graph source: scratch inventory (dev_01 not usable)'); }
const fks = inv.constraints.filter(c => c.type === 'f' && c.table.startsWith('public.'))
  .map(c => ({ child: c.table.replace('public.', ''), parent: /REFERENCES (?:public\.)?(\w+)\(/.exec(c.def)?.[1], rule: /ON DELETE (CASCADE|SET NULL|RESTRICT|NO ACTION|SET DEFAULT)/.exec(c.def)?.[1] ?? 'NO ACTION' }))
  .filter(f => f.parent && f.parent !== f.child);
const tables = (await db.query(`select tablename t from pg_tables where schemaname='public'`)).rows.map(r => r.t);
const deps = new Map(tables.map(t => [t, new Set()]));           // t must be deleted AFTER everything that references it
for (const f of fks) if (deps.has(f.parent)) deps.get(f.parent).add(f.child);
const order = [], seen = new Set(), temp = new Set();
const visit = (t) => { if (seen.has(t)) return; if (temp.has(t)) throw new Error('FK cycle at ' + t); temp.add(t); for (const c of deps.get(t) ?? []) visit(c); temp.delete(t); seen.add(t); order.push(t); };
// order = children first (post-order over "referenced by")
for (const t of tables) visit(t);
const deleteOrder = order.filter(t => t !== 'profiles');
console.log(`FKs: ${fks.length} (${fks.filter(f => f.rule === 'RESTRICT' || f.rule === 'NO ACTION').length} RESTRICT/NO ACTION) | delete order (children first, profiles last):\n  ` + deleteOrder.join(' > ') + ' > [auth.users -> cascades profiles]');
fs.writeFileSync('out/cleanup_order.json', JSON.stringify(deleteOrder));

// --- schema snapshot before
const norm = (v) => { const c = JSON.parse(JSON.stringify(v)); delete c.meta; delete c.auth_summary; delete c.storage_object_counts; for (const t of c.tables) delete t.est_rows; for (const s of c.sequences) delete s.last_value; return JSON.stringify(c); };
const schemaBefore = norm((await db.query(inspect)).rows[0].inventory);

// --- (5) negative test: naive deletion of the test accounts first must FAIL (restrict FKs)
await db.exec('begin;');
await db.exec('savepoint naive;');
try { await db.exec(`delete from auth.users where id in ('${T1}','${T2}','${T3}')`); console.log('\nNAIVE order: unexpectedly succeeded'); }
catch (e) { console.log('\nNAIVE order (delete test users first) correctly FAILS:', String(e.message).slice(0, 110)); }
await db.exec('rollback to savepoint naive; release savepoint naive;');

// --- (6) safe cleanup in the same (single) transaction with post-condition assertions
for (const t of deleteOrder) await db.exec(`delete from public.${t}`);
await db.exec(`delete from auth.users where id in ('${T1}','${T2}','${T3}')`);
const left = await rowCounts();
const nonEmpty = Object.entries(left).filter(([, n]) => n > 0);
const ownerKept = (await db.query(`select count(*) c from public.profiles where id='${O}' and role='cto' and approved and active`)).rows[0].c;
const authLeft = (await db.query(`select email from auth.users order by 1`)).rows.map(r => r.email);
if (nonEmpty.length !== 1 || nonEmpty[0][0] !== 'profiles' || nonEmpty[0][1] !== 1 || Number(ownerKept) !== 1) { await db.exec('rollback;'); console.log('POST-CONDITION FAILED', nonEmpty); process.exit(1); }
await db.exec('commit;');
console.log('CLEANUP committed. Remaining rows:', JSON.stringify(nonEmpty), '| owner intact (cto, approved, active):', Number(ownerKept) === 1, '| auth users left:', authLeft.join(','));

// --- (7) schema unchanged
const schemaAfter = norm((await db.query(inspect)).rows[0].inventory);
console.log('SCHEMA identical before vs after cleanup (all migration-owned sections):', schemaBefore === schemaAfter);
const trig = (await db.query(`select count(*) c from pg_trigger where not tgisinternal and tgenabled <> 'O'`)).rows[0].c;
console.log('user triggers not enabled after cleanup (must be 0):', trig);

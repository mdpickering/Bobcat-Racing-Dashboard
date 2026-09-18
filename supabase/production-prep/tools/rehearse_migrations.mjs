// Phase 6.7 tool: rehearse supabase/migrations/*.sql on a CLEAN, in-memory scratch Postgres (PGlite/WASM)
// with a minimal Supabase-shaped stub (auth.users/uid(), storage.buckets/objects/foldername(), anon/
// authenticated/service_role roles + Supabase-style default privileges). It never connects to any Supabase
// project and needs no credentials. Each migration runs in its own transaction and stops on the first error.
//
// Setup (outside the project, so package.json is untouched):
//   mkdir %TEMP%\pg-rehearse && cd %TEMP%\pg-rehearse && npm init -y && npm i @electric-sql/pglite
//   node <repo>\supabase\production-prep\tools\rehearse_migrations.mjs <repo> [--legacy-stub] [--probe]
// Flags: --legacy-stub adds a stand-in public.workspace_state table; --probe runs the import-vs-trigger
// experiment (naive insert fails; per-trigger DISABLE/ENABLE import succeeds and preserves attribution).
// Output: ./out/*.json inventories (same format as 01_inspect_schema_readonly.sql).
// NOTE: a stub is not a real Supabase instance; it validates SQL ordering/syntax and object inventory only.
// Scratch rehearsal ONLY: an in-memory WASM Postgres with a minimal Supabase-shaped stub.
// Touches no Supabase project. Usage: node rehearse.mjs <repoRoot> [--legacy-stub]
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
import path from 'node:path';

const repo = process.argv[2];
const withLegacy = process.argv.includes('--legacy-stub');
const outDir = path.join(process.cwd(), 'out');
fs.mkdirSync(outDir, { recursive: true });

const prelude = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb,
  email_confirmed_at timestamptz
);
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid, provider text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

const legacy = `
-- stand-in for the old production structure: a single opaque blob table
create table public.workspace_state (id text primary key, data jsonb not null, updated_at timestamptz default now());
`;

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(prelude);
if (withLegacy) await db.exec(legacy);

const inspect = fs.readFileSync(path.join(repo, 'supabase/production-prep/01_inspect_schema_readonly.sql'), 'utf8');

async function snapshot(label) {
  let r;
  try { r = await db.query(inspect); }
  catch (e) { console.log('INSPECTION QUERY ERROR:', String(e.message).slice(0, 400), '| position:', e.position); process.exit(2); }
  const inv = r.rows[0].inventory;
  fs.writeFileSync(path.join(outDir, `${label}.json`), JSON.stringify(inv, null, 1));
  return inv;
}

const before = await snapshot('scratch_before_migrations');
console.log('inspection query ran on pre-migration DB; tables:', before.tables.map(t => t.name));

const dir = path.join(repo, 'supabase/migrations');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
for (const f of files) {
  const sql = fs.readFileSync(path.join(dir, f), 'utf8');
  try {
    await db.exec('begin;\n' + sql + '\ncommit;');
    console.log('OK   ', f);
  } catch (e) {
    console.log('FAIL ', f, '->', e.message);
    try { await db.exec('rollback;'); } catch {}
    process.exit(1);
  }
}

const after = await snapshot('scratch_after_0001_0021');

if (process.argv.includes('--probe')) {
  const tryq = async (label, sql) => {
    try { const r = await db.query(sql); console.log('PROBE ok   ', label, JSON.stringify(r.rows ?? []).slice(0, 400)); return r; }
    catch (e) { console.log('PROBE ERROR', label, '->', String(e.message).slice(0, 200)); }
  };
  const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
  await tryq('auth users', `insert into auth.users(id,email) values ('${A}','a@x.test'),('${B}','b@x.test')`);
  await tryq('profiles auto-created', `select id, approved, active, role from public.profiles order by id`);
  await tryq('subsystem', `insert into public.subsystems(id,name) values ('drivetrain','Drivetrain')`);
  await tryq('NAIVE task insert (auth.uid() null)', `insert into public.tasks(id,title,subsystem_id,created_by,status,created_at) values (gen_random_uuid(),'t','drivetrain','${A}','Complete','2025-01-01')`);
  await tryq('disable tasks_before_write', `alter table public.tasks disable trigger tasks_before_write`);
  await tryq('import task', `insert into public.tasks(id,title,subsystem_id,created_by,status,completed_at,created_at,legacy_id) values ('aaaaaaaa-0000-4000-8000-000000000001','t','drivetrain','${A}','Complete','2025-02-02','2025-01-01','L1')`);
  await tryq('import assignee (primary) fires sync trigger', `insert into public.task_assignees(task_id,user_id,role) values ('aaaaaaaa-0000-4000-8000-000000000001','${B}','primary')`);
  await tryq('task row after import', `select created_by=('${A}') as created_by_kept, completed_at, primary_owner_id=('${B}') as owner_synced, legacy_id from public.tasks`);
  await tryq('notifications created by import (noise)', `select type, user_id=('${B}') as to_b from public.notifications`);
  await tryq('re-enable', `alter table public.tasks enable trigger tasks_before_write`);
  await tryq('NAIVE purchase insert', `insert into public.purchase_requests(id,subsystem_id,requested_by,title,status) values (gen_random_uuid(),'drivetrain','${A}','p','Completed')`);
  for (const t of ['purchase_requests_before_write','purchase_requests_log_status_change','purchase_requests_notify_status_change'])
    await tryq('disable ' + t, `alter table public.purchase_requests disable trigger ${t}`);
  await tryq('import purchase', `insert into public.purchase_requests(id,subsystem_id,requested_by,title,status,reviewed_by,reviewed_at,legacy_id,legacy_status_raw,created_at) values ('bbbbbbbb-0000-4000-8000-000000000001','drivetrain','${A}','p','Completed','${B}','2025-03-03','P1','Received','2025-03-01')`);
  await tryq('import history row', `insert into public.purchase_status_history(purchase_request_id,from_status,to_status,changed_by,changed_at,legacy_id) values ('bbbbbbbb-0000-4000-8000-000000000001','Approved','Completed','${B}','2025-03-03','H1')`);
  for (const t of ['purchase_requests_before_write','purchase_requests_log_status_change','purchase_requests_notify_status_change'])
    await tryq('enable ' + t, `alter table public.purchase_requests enable trigger ${t}`);
  await tryq('purchase after import', `select status, requested_by=('${A}') as req_kept, reviewed_by=('${B}') as rev_kept, legacy_status_raw, created_at::date from public.purchase_requests`);
  await tryq('history rows (only the imported one expected)', `select count(*) from public.purchase_status_history`);
  await tryq('all user triggers enabled again?', `select tgrelid::regclass::text t, tgname, tgenabled from pg_trigger where not tgisinternal and tgenabled <> 'O'`);
}
const c = (k) => Array.isArray(after[k]) ? after[k].length : Object.keys(after[k]).length;
console.log('after-migration counts:', Object.fromEntries(
  ['tables','constraints','indexes','enums','functions','triggers','policies','column_acls','storage_buckets'].map(k => [k, c(k)])));


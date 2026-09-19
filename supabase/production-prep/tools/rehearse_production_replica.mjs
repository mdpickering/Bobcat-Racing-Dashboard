// Phase 6.7 tool: rehearse migrations against a scratch replica of the REAL production shape
// (four legacy tables + open policies + realtime publication, built from results/prod_01_inventory.json).
// Scenarios: S0 replica snapshot | S1 unmodified 0001-0021 (fails at 0004: tasks exists) |
//            S2 prestep rename + 0001-0021 | S3 rollback/99 + undo rename | S4 object counts after every migration.
// Never connects to any Supabase project. Writes ./out/*.json (inventories comparable with tools/compare_inventory.mjs).
// Setup and usage: see supabase/production-prep/README.md   ->   node rehearse_production_replica.mjs <repoRoot>
// Scratch replica of the REAL production shape (from prod_01_inventory.json). No Supabase connection.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
import path from 'node:path';

const repo = process.argv[2];
const prep = path.join(repo, 'supabase/production-prep');
const inspect = fs.readFileSync(path.join(prep, '01_inspect_schema_readonly.sql'), 'utf8');
const migDir = path.join(repo, 'supabase/migrations');
const files = fs.readdirSync(migDir).filter(f => f.endsWith('.sql')).sort();
fs.mkdirSync('out', { recursive: true });

const stub = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, email_confirmed_at timestamptz);
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid, provider text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

// exactly the four production tables, columns, PKs, RLS policies and realtime publication from prod_01
const legacy = `
create table public.tasks (id text not null primary key, title text not null, subsystem_id text, category text, priority text default 'Medium', status text default 'To Do', assignee text, deadline date, notes text, created_at timestamptz default now());
create table public.orders (id text not null primary key, item text not null, subsystem_id text, vendor text, vendor_url text, part_number text, qty integer default 1, unit_price numeric(10,2) default 0, urgency text default 'Next Batch Order', requested_by text, status text default 'Requested', submitted_at timestamptz default now());
create table public.subteams (id text not null primary key, name text not null, lead text, members text[], subsystem_id text);
create table public.workspace_state (id text not null primary key, taxonomy jsonb, tasks jsonb, orders jsonb, timeline_columns jsonb, recurring_events jsonb, timeline_milestones jsonb, updated_at timestamptz default now());
alter table public.tasks enable row level security; alter table public.orders enable row level security;
alter table public.subteams enable row level security; alter table public.workspace_state enable row level security;
create policy "Allow all on orders" on public.orders for all to public using (true) with check (true);
create policy "Allow all on subteams" on public.subteams for all to public using (true) with check (true);
create policy "Allow all on tasks" on public.tasks for all to public using (true) with check (true);
create policy "Enable public read for all" on public.workspace_state for select to public using (true);
create policy "Enable public write/upsert for all" on public.workspace_state for all to public using (true) with check (true);
create publication supabase_realtime for table public.orders, public.subteams, public.tasks, public.workspace_state;
`;

async function newReplica() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(stub);
  await db.exec(legacy);
  return db;
}
async function snap(db, label) {
  const inv = (await db.query(inspect)).rows[0].inventory;
  fs.writeFileSync(`out/${label}.json`, JSON.stringify(inv, null, 1));
  return inv;
}
async function applyAll(db, { stopOnError = true } = {}) {
  for (const f of files) {
    const sql = fs.readFileSync(path.join(migDir, f), 'utf8');
    try { await db.exec('begin;\n' + sql + '\ncommit;'); console.log('  OK  ', f); }
    catch (e) {
      console.log('  FAIL', f, '->', String(e.message).slice(0, 160));
      try { await db.exec('rollback;'); } catch {}
      return f;
    }
  }
  return null;
}
const run = async (db, file) => db.exec(fs.readFileSync(path.join(prep, file), 'utf8'));

console.log('\n### S0: replica fidelity snapshot (compare with prod_01 externally)');
{ const db = await newReplica(); await snap(db, 'replica_before'); }

console.log('\n### S1: migrations 0001-0021 UNMODIFIED against production shape');
{
  const db = await newReplica();
  const failed = await applyAll(db);
  const partial = await snap(db, 'replica_s1_after');
  console.log('  -> failed at:', failed, '| public tables now:', partial.tables.filter(t => t.name.startsWith('public.')).map(t => t.name.replace('public.', '')).join(','));
  console.log('  -> legacy tasks untouched (columns):', partial.columns['public.tasks'].length, 'cols');
}

console.log('\n### S2: pre-step rename, then 0001-0021');
let s2db;
{
  const db = await newReplica();
  await run(db, 'prestep/00_rename_legacy_tasks.sql');
  const failed = await applyAll(db);
  console.log('  -> failed at:', failed);
  await snap(db, 'replica_s2_after');
  s2db = db;
}

console.log('\n### S3: rollback (99 then undo-rename) on the S2 database');
{
  const db = s2db;
  // the rollback script refuses to run without an explicit confirmation (safety guard, live-DB promotion)
  try { await run(db, 'rollback/99_rollback_v2_schema.sql'); console.log('  GUARD FAILED: rollback ran without confirmation'); } catch (e) { console.log('  guard OK: rollback refuses without confirmation ->', String(e.message).slice(0, 70)); await db.exec('rollback;'); }
  await db.exec("select set_config('app.confirm_rollback_v2','DROP-EVERYTHING',false);"); await run(db, 'rollback/99_rollback_v2_schema.sql');
  await run(db, 'rollback/00_undo_rename_legacy_tasks.sql');
  await snap(db, 'replica_s3_after_rollback');
  console.log('  rollback executed without error');
}

console.log('\n### S4: cumulative object counts after each migration (clean DB, no legacy)');
{
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(stub);
  const rows = [];
  for (const f of files) {
    await db.exec('begin;\n' + fs.readFileSync(path.join(migDir, f), 'utf8') + '\ncommit;');
    const inv = await snap(db, 'tmp');
    const pub = (a) => a.filter(x => (x.name || x.table || '').startsWith('public.'));
    rows.push({
      migration: f.replace('.sql', ''),
      tables: inv.tables.filter(t => t.name.startsWith('public.')).length,
      functions: inv.functions.length,
      triggers: inv.triggers.length,
      policies: inv.policies.length,
      enums: inv.enums.length,
      indexes: inv.indexes.length,
      buckets: inv.storage_buckets.length,
    });
  }
  fs.writeFileSync('out/per_migration_counts.json', JSON.stringify(rows, null, 1));
  console.table(rows);
}


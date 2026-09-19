// Phase 6.8 preparation: GENERATE the bobcat-dev test-data cleanup SQL from the approved inventories.
// Reads (local, git-ignored): results/dev_06_data_inventory.json, results/dev_07_child_actors.json, results/dev_cleanup_classification.json
// Writes:  supabase/production-prep/cleanup/08a_cleanup_DRY_RUN.sql        (identical checks + deletes, ends in ROLLBACK)
//          supabase/production-prep/cleanup/08b_cleanup_EXECUTE.sql        (same, ends in COMMIT)
//          supabase/production-prep/cleanup/10_post_dashboard_verify_readonly.sql
//          supabase/production-prep/cleanup/09_DASHBOARD_STEPS.md
// It EXECUTES NOTHING. Only ids/counts/hashes go into the SQL (no e-mails, titles or comment text).
//   node generate_cleanup_sql.mjs                       normal output (expects the REAL bobcat-dev: 36 public functions)
//   node generate_cleanup_sql.mjs --scratch <dir>       test variant for the scratch database (35 functions) written to <dir>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const prep = path.resolve(here, '..');
const rdir = path.join(prep, 'results');
const si = process.argv.indexOf('--scratch');
const scratch = si >= 0;
const outDir = scratch ? path.resolve(process.argv[si + 1]) : path.join(prep, 'cleanup');
fs.mkdirSync(outDir, { recursive: true });

const d6 = JSON.parse(fs.readFileSync(path.join(rdir, 'dev_06_data_inventory.json'), 'utf8'));
let d7 = JSON.parse(fs.readFileSync(path.join(rdir, 'dev_07_child_actors.json'), 'utf8')); if (d7.child_actor_inventory) d7 = d7.child_actor_inventory;
const cls = JSON.parse(fs.readFileSync(path.join(rdir, 'dev_cleanup_classification.json'), 'utf8'));

// ---- the approved decision must match exactly what the classifier produced
const T = cls.totals;
if (T.DELETE !== 216 || T.HOLD !== 17 || T.KEEP !== 3 || T['DELETE*'] !== 0) throw new Error('classification totals are not the approved 216/17/3/0: ' + JSON.stringify(T));
const APPROVED_DELETE_TOTAL = 216 + 17;    // 233 (owner approved deleting all 17 HOLD items)

const email2id = Object.fromEntries(d6.profiles.map((p) => [p.email, p.id]));
const ownerEmail = d6.profiles.map((p) => p.email).find((e) => !/@bobcat-test\.dev$/i.test(e));
const ownerId = email2id[ownerEmail];
const testAccounts = d6.profiles.filter((p) => p.id !== ownerId).map((p) => p.email);
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const keyHash = (keys) => md5([...keys].sort().join(','));       // JS default sort == byte order == SQL `collate "C"` for ASCII keys
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// ---- expected key sets (table -> {schema, keyExpr, keys[]})
const E = {};
const reg = (tbl, keyExpr, keys, schema = 'public') => (E[`${schema}.${tbl}`] = { schema, tbl, keyExpr, keys });
reg('audit_logs', 'id::text', []);
reg('cad_review_comments', 'id::text', d7.cad_review_comments.map((r) => r.id));
reg('cad_review_versions', 'id::text', d7.cad_review_versions.map((r) => r.id));
reg('cad_reviews', 'id::text', d6.cad_reviews.map((r) => r.id));
reg('calendar_events', 'id::text', d6.calendar_events.map((r) => r.id));
reg('comment_mentions', "comment_id::text || '/' || mentioned_profile_id::text", d7.comment_mentions.map((m) => `${m.comment_id}/${email2id[m.mentioned]}`));
reg('competition_settings', 'season', d6.competition_settings.map((r) => r.season));
reg('member_applications', 'id::text', d6.member_applications.map((r) => r.id));
reg('migration_exceptions', 'id::text', d6.migration_exceptions.map((r) => r.id));
reg('migration_log', 'id::text', []);
reg('milestones', 'id::text', d6.milestones.map((r) => r.id));
reg('notifications', 'id::text', d7.notification_rows.map((r) => r.id));
reg('purchase_request_items', 'id::text', d7.purchase_request_items.map((r) => r.id));
reg('purchase_requests', 'id::text', d6.purchase_requests.map((r) => r.id));
reg('purchase_status_history', 'id::text', d7.purchase_status_history.map((r) => r.id));
reg('recurring_events', 'id::text', d6.recurring_events.map((r) => r.id));
reg('subsystem_categories', 'id::text', d6.subsystem_categories.map((r) => r.id));
reg('subsystem_members', "subsystem_id || '/' || user_id::text", d6.subsystem_members.map((m) => `${m.subsystem_id}/${email2id[m.user_email]}`));
reg('subsystems', 'id', d6.subsystems.map((r) => r.id));
reg('task_assignees', "task_id::text || '/' || user_id::text", d6.task_assignees.map((a) => `${a.task_id}/${email2id[a.user_email]}`));
reg('task_attachments', 'id::text', d6.task_attachments.map((r) => r.id));
reg('task_comments', 'id::text', d6.task_comments.map((r) => r.id));
reg('task_requests', 'id::text', d6.task_requests.map((r) => r.id));
reg('tasks', 'id::text', d6.tasks.map((r) => r.id));
reg('timeline_columns', 'key', d6.timeline_columns.map((r) => r.key));
reg('timeline_milestones', "subsystem_id || '/' || timeline_column_key", d6.timeline_milestones.map((m) => `${m.subsystem_id}/${m.timeline_column_key}`));
const DELETE_TABLES = Object.keys(E).map((k) => E[k].tbl);
// KEPT / unchanged objects (also fingerprinted so drift in them aborts the run)
reg('profiles', 'id::text', d6.profiles.map((p) => p.id));
reg('users', 'id::text', d6.auth_users.map((u) => u.id), 'auth');
reg('objects', "bucket_id || '/' || name", d6.storage_objects.map((o) => `${o.bucket}/${o.name}`), 'storage');

// sanity: counts must equal the inventory's exact row counts, and the approved delete total must be 233 (216 + 17 HOLD)
for (const t of DELETE_TABLES) if (E[`public.${t}`].keys.length !== Number(d6.row_counts[t])) throw new Error(`key count mismatch for ${t}: ${E[`public.${t}`].keys.length} vs ${d6.row_counts[t]}`);
const dataRows = DELETE_TABLES.reduce((n, t) => n + E[`public.${t}`].keys.length, 0);
// 233 approved deletions = data rows in the 26 tables (206) + 3 test auth users + 3 test profiles + 2 storage files - counted separately below
const approvedInSql = dataRows, approvedDashboard = 3 + 3 + 2;
if (approvedInSql + approvedDashboard !== APPROVED_DELETE_TOTAL) throw new Error(`accounting: ${approvedInSql} + ${approvedDashboard} != ${APPROVED_DELETE_TOTAL}`);

// FK-safe order, children first (derived from the 46 real bobcat-dev foreign keys and rehearsed: tools/rehearse_cleanup.mjs)
const ORDER = ['audit_logs', 'cad_review_comments', 'cad_review_versions', 'cad_reviews', 'calendar_events', 'comment_mentions', 'member_applications', 'migration_exceptions', 'notifications', 'purchase_request_items', 'purchase_status_history', 'purchase_requests', 'subsystem_members', 'task_assignees', 'task_attachments', 'task_comments', 'task_requests', 'tasks', 'timeline_milestones', 'milestones', 'recurring_events', 'subsystem_categories', 'subsystems', 'timeline_columns', 'competition_settings', 'migration_log'];
if (ORDER.length !== DELETE_TABLES.length || !ORDER.every((t) => DELETE_TABLES.includes(t))) throw new Error('delete order does not cover the 26 tables');

const expectedRows = Object.values(E).map((e) => `  (${q(e.schema)}, ${q(e.tbl)}, ${q(e.keyExpr)}, ${e.keys.length}, ${q(keyHash(e.keys))})`).join(',\n');
const FUNCS = scratch ? 35 : 36;   // bobcat-dev has 36 public functions (35 from the migrations + Supabase's rls_auto_enable)

const header = (mode) => `-- =========================================================
-- ${mode === 'dry' ? '08a_cleanup_DRY_RUN.sql' : '08b_cleanup_EXECUTE.sql'}     bobcat-dev test-data cleanup     ${mode === 'dry' ? '*** DRY RUN: ends in ROLLBACK, changes nothing ***' : '*** DESTRUCTIVE: ends in COMMIT ***'}
-- Generated by tools/generate_cleanup_sql.mjs from the approved inventories (scripts 06 + 07) and the owner-approved classification:
--   DELETE 216 + HOLD 17 (all approved for deletion) = 233 items, KEEP 3 (owner auth user, owner profile, task-attachments bucket + its policies).
-- Of the 233: ${dataRows} rows are deleted by THIS script (26 tables); ${approvedDashboard} are removed in the Dashboard afterwards (3 test auth users,
-- their 3 profiles by cascade, 2 storage files) - see 09_DASHBOARD_STEPS.md. profiles / auth.users / storage.objects / the bucket are NOT touched here.
--
-- RUN IT ON: bobcat-dev ONLY, in the SQL Editor (role postgres). NEVER on the old legacy project (guard 1 refuses if legacy tables exist).
-- ORDER OF OPERATIONS: 1) run 08a (dry run)  2) run 08b (execute)  3) Dashboard steps  4) run 10_post_dashboard_verify_readonly.sql
-- Everything below is ONE transaction: if any guard, precondition, delete or post-check fails, NOTHING is deleted.
-- (The SQL Editor may ask you to confirm because the script contains DELETE statements - that is expected.)
-- Does not touch the old project, workspace_state, the schema, policies, functions, triggers, grants or the Auth configuration.
-- =========================================================
begin;
set local row_security = off;
set local lock_timeout = '15s';

-- ---------------------------------------------------------
-- 1) GUARD: this must be bobcat-dev, not the legacy project. The legacy project has workspace_state / orders / subteams.
-- ---------------------------------------------------------
do $guard$
begin
  if to_regclass('public.workspace_state') is not null or to_regclass('public.orders') is not null or to_regclass('public.subteams') is not null then
    raise exception 'ABORT (guard): legacy tables exist - this looks like the OLD live project. Nothing was changed.';
  end if;
  if to_regclass('public.profiles') is null or to_regclass('public.tasks') is null or to_regclass('public.migration_exceptions') is null then
    raise exception 'ABORT (guard): the v2 tables are missing - this is not bobcat-dev. Nothing was changed.';
  end if;
  if not exists (select 1 from auth.users where id = ${q(ownerId)}::uuid) then
    raise exception 'ABORT (guard): the owner account ${ownerId} is not in auth.users. Nothing was changed.';
  end if;
end
$guard$;

-- ---------------------------------------------------------
-- 2) LOCK the 26 data tables against writes (reads still work) so nothing can change between the check and the deletes
-- ---------------------------------------------------------
lock table ${ORDER.map((t) => 'public.' + t).join(', ')} in exclusive mode;

-- ---------------------------------------------------------
-- 3) PRECONDITION: the database must match the approved inventory EXACTLY - row count AND an md5 fingerprint of the sorted row keys - for the
--    26 tables to be emptied and for the objects that must stay unchanged (profiles, auth.users, storage.objects).
--    A single extra, missing or different row aborts the whole run before anything is deleted.
-- ---------------------------------------------------------
create temp table _cleanup_expected (sch text, tbl text, key_expr text, n bigint, h text) on commit drop;
insert into _cleanup_expected values
${expectedRows};

do $pre$
declare
  r record;
  actual_n bigint;
  actual_h text;
  bad text := '';
begin
  for r in select * from _cleanup_expected order by sch, tbl loop
    execute format('select count(*), coalesce(md5(string_agg(k, %L order by k collate "C")), md5('''')) from (select %s as k from %I.%I) s',
                   ',', r.key_expr, r.sch, r.tbl)
      into actual_n, actual_h;
    if actual_n <> r.n or actual_h <> r.h then
      bad := bad || format('%s.%s expected %s rows, found %s rows%s; ', r.sch, r.tbl, r.n, actual_n, case when actual_n = r.n then ' (same count, DIFFERENT rows)' else '' end);
    end if;
  end loop;
  if bad <> '' then
    raise exception 'ABORT (precondition): the database no longer matches the approved inventory. NOTHING WAS DELETED. Differences: %', bad;
  end if;
end
$pre$;

-- ---------------------------------------------------------
-- 4) DELETE (children first - the order was derived from the 46 real foreign keys and rehearsed). No WHERE is needed: the precondition
--    proved these tables contain exactly the approved rows and nothing else.
-- ---------------------------------------------------------
${ORDER.map((t) => `delete from public.${t};`).join('\n')}

-- ---------------------------------------------------------
-- 5) POST-CHECKS (still inside the transaction; any failure rolls everything back)
-- ---------------------------------------------------------
do $post$
declare
  r record;
  n bigint;
  bad text := '';
begin
  -- 5a) the 26 tables are empty
  for r in select tbl from _cleanup_expected where sch = 'public' and tbl not in ('profiles') loop
    execute format('select count(*) from public.%I', r.tbl) into n;
    if n <> 0 then bad := bad || format('%s still has %s rows; ', r.tbl, n); end if;
  end loop;
  -- 5b) the objects that must stay are unchanged
  if (select count(*) from public.profiles) <> ${d6.profiles.length} then bad := bad || 'profiles count changed; '; end if;
  if not exists (select 1 from public.profiles where id = ${q(ownerId)}::uuid and role = 'admin' and approved and active) then bad := bad || 'owner profile is not admin/approved/active; '; end if;
  if (select count(*) from auth.users) <> ${d6.auth_users.length} then bad := bad || 'auth.users count changed; '; end if;
  if (select count(*) from storage.objects) <> ${d6.storage_objects.length} then bad := bad || 'storage.objects count changed; '; end if;
  if not exists (select 1 from storage.buckets where id = 'task-attachments' and public = false and file_size_limit = 20971520) then bad := bad || 'task-attachments bucket missing or changed; '; end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'task_attachments_storage_%') <> 2 then bad := bad || 'storage policies changed; '; end if;
  -- 5c) the schema is untouched (same counts as the verified inventory dev_01)
  if (select count(*) from pg_tables where schemaname = 'public') <> 27 then bad := bad || 'public table count <> 27; '; end if;
  if (select count(*) from pg_policies where schemaname in ('public', 'storage')) <> 88 then bad := bad || 'policy count <> 88; '; end if;
  if (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and c.relnamespace = 'public'::regnamespace) <> 38 then bad := bad || 'public trigger count <> 38; '; end if;
  if (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and t.tgenabled <> 'O' and (c.relnamespace = 'public'::regnamespace or c.oid = 'auth.users'::regclass)) <> 0 then bad := bad || 'a public/auth.users trigger is not enabled; '; end if;
  if (select count(*) from pg_trigger where tgname = 'on_auth_user_created' and tgenabled = 'O') <> 1 then bad := bad || 'on_auth_user_created missing/disabled; '; end if;
  if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')) <> ${FUNCS} then bad := bad || 'public function count <> ${FUNCS}; '; end if;
  if bad <> '' then
    raise exception 'ABORT (post-check): % - the transaction is rolled back, nothing was deleted.', bad;
  end if;
end
$post$;

${mode === 'dry'
  ? `-- ---------------------------------------------------------
-- DRY RUN ends here: undo everything, then report. Nothing above was kept.
-- ---------------------------------------------------------
rollback;
select 'DRY RUN PASSED - guard, precondition, ${dataRows} deletes and all post-checks succeeded, then everything was ROLLED BACK. Nothing was changed.' as result,
       (select count(*) from public.tasks) as tasks_still_present_after_rollback;`
  : `-- ---------------------------------------------------------
-- EXECUTE: keep the deletions.
-- ---------------------------------------------------------
commit;
select 'CLEANUP COMMITTED - ${dataRows} rows deleted from 26 tables. Next: the Dashboard steps (09_DASHBOARD_STEPS.md), then run 10_post_dashboard_verify_readonly.sql.' as result,
       (select count(*) from public.profiles) as profiles_until_dashboard_step,
       (select count(*) from public.tasks) + (select count(*) from public.purchase_requests) + (select count(*) from public.cad_reviews) as data_rows_left_check;`}
`;

fs.writeFileSync(path.join(outDir, '08a_cleanup_DRY_RUN.sql'), header('dry'));
fs.writeFileSync(path.join(outDir, '08b_cleanup_EXECUTE.sql'), header('exec'));

// ---- 10: read-only verification AFTER the Dashboard deletions
const v10 = `-- =========================================================
-- 10_post_dashboard_verify_readonly.sql     READ-ONLY (one SELECT). Run on bobcat-dev AFTER 08b and the two Dashboard steps.
-- Expected: "all_ok": true.   Changes nothing.
-- =========================================================
select jsonb_build_object(
  'all_ok', (
        (select count(*) from auth.users) = 1
    and (select count(*) from auth.users where id = ${q(ownerId)}::uuid) = 1
    and (select count(*) from public.profiles) = 1
    and (select count(*) from public.profiles where id = ${q(ownerId)}::uuid and role = 'admin' and approved and active) = 1
    and (select count(*) from auth.users where email ilike '%@bobcat-test.dev') = 0
    and (select count(*) from storage.objects) = 0
    and (select count(*) from storage.buckets where id = 'task-attachments' and public = false and file_size_limit = 20971520) = 1
    and (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'task_attachments_storage_%') = 2
    and (select coalesce(sum((xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', t.schemaname, t.tablename), false, true, '')))[1]::text::bigint), 0)
         from pg_tables t where t.schemaname = 'public' and t.tablename <> 'profiles') = 0
    and (select count(*) from pg_tables where schemaname = 'public') = 27
    and (select count(*) from pg_policies where schemaname in ('public', 'storage')) = 88
    and (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and t.tgenabled <> 'O' and (c.relnamespace = 'public'::regnamespace or c.oid = 'auth.users'::regclass)) = 0
    and (select count(*) from pg_trigger where tgname = 'on_auth_user_created' and tgenabled = 'O') = 1
    and (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')) = ${FUNCS}
  ),
  'auth_users', (select count(*) from auth.users),
  'test_auth_users_left', (select count(*) from auth.users where email ilike '%@bobcat-test.dev'),
  'profiles', (select count(*) from public.profiles),
  'application_rows_left_excluding_profiles', (select coalesce(sum((xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', t.schemaname, t.tablename), false, true, '')))[1]::text::bigint), 0)
         from pg_tables t where t.schemaname = 'public' and t.tablename <> 'profiles'),
  'storage_objects', (select count(*) from storage.objects),
  'bucket_present', (select count(*) from storage.buckets where id = 'task-attachments'),
  'storage_policies', (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'task_attachments_storage_%'),
  'public_tables', (select count(*) from pg_tables where schemaname = 'public'),
  'policies_public_storage', (select count(*) from pg_policies where schemaname in ('public', 'storage'))
) as post_dashboard_verification;
`;
fs.writeFileSync(path.join(outDir, '10_post_dashboard_verify_readonly.sql'), v10);

// ---- 09: Dashboard steps
const objs = d6.storage_objects.map((o) => `- \`${o.bucket}/${o.name}\`  (${o.size} bytes, ${o.mimetype})`).join('\n');
const md = `# Dashboard steps — run AFTER \`08b_cleanup_EXECUTE.sql\` (nothing here has been done)

These two removals cannot be done with SQL: Supabase blocks direct \`DELETE\` on \`storage.objects\`, and test **auth users** are removed through the Auth admin path. Do them in this order.

## Step A — delete the 2 test files (Dashboard → Storage → \`task-attachments\`)
Delete exactly these ${d6.storage_objects.length} objects (they are the only files in the bucket):
${objs}

**Do NOT delete the bucket \`task-attachments\` and do not touch its policies.** After deleting, the bucket must show 0 objects.

## Step B — delete the ${testAccounts.length} test auth users (Dashboard → Authentication → Users)
Only after 08b has committed (before that, the accounts are still referenced by foreign keys). Delete exactly:
${testAccounts.map((e) => `- \`${e}\``).join('\n')}

**KEEP the owner's account (the only \`@quinnipiac.edu\` user, id \`${ownerId}\`).** If the dialog offers "soft delete", choose the **permanent** delete. Deleting an auth user cascades to its \`public.profiles\` row (the profile foreign key is \`ON DELETE CASCADE\`), so 3 profiles disappear with them and 1 remains.

## Step C — verify (\`10_post_dashboard_verify_readonly.sql\`)
It must return \`"all_ok": true\` with 1 auth user, 1 profile, 0 storage objects, the bucket + its 2 policies present, 27 tables, 88 policies.

## Not part of this cleanup
The old legacy Supabase project, \`workspace_state\`, the schema, policies, functions, triggers, Auth settings and the production data import are not touched. The import has not started.
`;
fs.writeFileSync(path.join(outDir, '09_DASHBOARD_STEPS.md'), md);

console.log(`generated${scratch ? ' (SCRATCH variant, ' + FUNCS + ' functions)' : ''} into ${outDir}`);
console.log(`approved accounting: ${dataRows} SQL rows + ${approvedDashboard} Dashboard items (3 auth users + 3 profiles + 2 storage files) = ${dataRows + approvedDashboard} = ${APPROVED_DELETE_TOTAL} (216 DELETE + 17 HOLD)`);
console.log('expected fingerprints for', Object.keys(E).length, 'tables (' + DELETE_TABLES.length + ' to be emptied + profiles/auth.users/storage.objects unchanged)');

-- =========================================================
-- 10_post_dashboard_verify_readonly.sql     READ-ONLY (one SELECT). Run on bobcat-dev AFTER 08b and the two Dashboard steps.
-- Expected: "all_ok": true.   Changes nothing.
-- =========================================================
select jsonb_build_object(
  'all_ok', (
        (select count(*) from auth.users) = 1
    and (select count(*) from auth.users where id = 'f15d8647-6a00-493a-8c07-1070f9a66b9b'::uuid) = 1
    and (select count(*) from public.profiles) = 1
    and (select count(*) from public.profiles where id = 'f15d8647-6a00-493a-8c07-1070f9a66b9b'::uuid and role = 'admin' and approved and active) = 1
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
    and (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')) = 36
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

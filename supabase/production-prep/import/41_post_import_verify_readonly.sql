-- =========================================================
-- 41_post_import_verify_readonly.sql     READ-ONLY (one SELECT). Run on bobcat-dev AFTER 40b_import_EXECUTE.sql.
-- Expected: "all_ok": true.   Changes nothing.
-- It checks the import's own bookkeeping for consistency (it needs no legacy data), so it works for any valid export.
-- =========================================================
select jsonb_build_object(
  'all_ok', (
        (select count(*) from public.subsystems) = 7
    and (select count(*) from public.subsystem_categories) = 25
    and (select count(*) from public.timeline_columns) = 15
    and (select count(*) from public.notifications) = 0
    and (select count(*) from public.audit_logs) = 0
    and (select count(*) from public.tasks where legacy_id is null or created_by <> (select id from public.profiles limit 1) or primary_owner_id is not null) = 0
    and (select count(*) from public.tasks t where t.category_id is not null and not exists (select 1 from public.subsystem_categories sc where sc.id = t.category_id and sc.subsystem_id = t.subsystem_id)) = 0
    -- every legacy task record is accounted for: 49 workspace_state + 20 relational-only = 69 = migrated + held
    and (select count(*) from public.migration_log where entity_type = 'task') = 69
    and (select count(*) from public.migration_log where entity_type = 'task' and status = 'migrated') = (select count(*) from public.tasks)
    and (select count(*) from public.migration_log where entity_type = 'task_relational_superseded') = 10
    and (select count(*) from public.migration_log where entity_type = 'order') = 2
    and (select count(*) from public.migration_log where entity_type = 'workspace_state') = 1
    and (select count(*) from public.migration_exceptions where resolution_status <> 'unresolved') = 0
    and (select count(*) from public.migration_exceptions where context::text ~* 'leadpin' or raw_value ~* 'leadpin') = 0
    and (select count(*) from public.profiles) = 1 and (select count(*) from auth.users) = 1
    and (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and t.tgenabled <> 'O' and (c.relnamespace = 'public'::regnamespace or c.oid = 'auth.users'::regclass)) = 0
    and (select count(*) from pg_tables where schemaname = 'public') = 27
    and (select count(*) from pg_policies where schemaname in ('public', 'storage')) = 88
  ),
  'tasks', (select count(*) from public.tasks),
  'tasks_held_as_exceptions', (select count(*) from public.migration_log where entity_type = 'task' and status = 'exception'),
  'purchase_requests', (select count(*) from public.purchase_requests),
  'orders_held_as_exceptions', (select count(*) from public.migration_log where entity_type = 'order' and status = 'exception'),
  'subsystems', (select count(*) from public.subsystems),
  'categories', (select count(*) from public.subsystem_categories),
  'timeline_columns', (select count(*) from public.timeline_columns),
  'timeline_cells', (select count(*) from public.timeline_milestones),
  'recurring_events', (select count(*) from public.recurring_events),
  'notifications', (select count(*) from public.notifications),
  'exceptions_unresolved_by_type', (select coalesce(jsonb_object_agg(entity_type, n), '{}'::jsonb) from (select entity_type, count(*) as n from public.migration_exceptions group by 1) x),
  'log_by_entity_status', (select coalesce(jsonb_object_agg(entity_type || ':' || status, n), '{}'::jsonb) from (select entity_type, status, count(*) as n from public.migration_log group by 1, 2) x)
) as post_import_verification;

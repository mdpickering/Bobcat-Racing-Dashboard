-- =========================================================
-- 04_preflight_checks_readonly.sql
-- Phase 6.7: READ-ONLY pre-flight for applying migrations 0001-0021. NOT a migration.
-- One single SELECT; changes nothing. GENERATED from the reference inventory of 0001-0021
-- (27 tables, 87 index names, 35 function names, 10 enum types) so the lists cannot drift.
--
-- Run it in the TARGET project immediately before applying 0001. Expected result on a clean
-- target:  "all_clear": true  and every check "ok": true.  If ANY check fails, do not apply anything.
--
-- Also run it after a failed/partial run: it shows exactly which objects already exist.
-- Output: one row, one jsonb column "preflight".
-- =========================================================
with
t_tables as (select unnest(array['audit_logs', 'cad_review_comments', 'cad_review_versions', 'cad_reviews', 'calendar_events', 'comment_mentions', 'competition_settings', 'member_applications', 'migration_exceptions', 'migration_log', 'milestones', 'notifications', 'profiles', 'purchase_request_items', 'purchase_requests', 'purchase_status_history', 'recurring_events', 'subsystem_categories', 'subsystem_members', 'subsystems', 'task_assignees', 'task_attachments', 'task_comments', 'task_requests', 'tasks', 'timeline_columns', 'timeline_milestones']) as name),
t_indexes as (select unnest(array['audit_logs_created_at_idx', 'audit_logs_entity_idx', 'audit_logs_pkey', 'audit_logs_user_id_idx', 'cad_review_comments_cad_review_id_idx', 'cad_review_comments_pkey', 'cad_review_versions_cad_review_id_idx', 'cad_review_versions_legacy_id_key', 'cad_review_versions_pkey', 'cad_review_versions_review_revision_key', 'cad_reviews_legacy_id_key', 'cad_reviews_pkey', 'cad_reviews_status_idx', 'cad_reviews_submitted_by_idx', 'cad_reviews_subsystem_id_idx', 'cad_reviews_task_id_idx', 'calendar_events_created_by_idx', 'calendar_events_pkey', 'calendar_events_start_time_idx', 'calendar_events_subsystem_id_idx', 'comment_mentions_mentioned_profile_idx', 'comment_mentions_pkey', 'competition_settings_pkey', 'member_applications_email_idx', 'member_applications_legacy_id_key', 'member_applications_linked_profile_idx', 'member_applications_pkey', 'member_applications_status_idx', 'migration_exceptions_batch_id_idx', 'migration_exceptions_entity_type_idx', 'migration_exceptions_pkey', 'migration_exceptions_resolution_status_idx', 'migration_log_batch_id_idx', 'migration_log_entity_legacy_key', 'migration_log_entity_type_idx', 'migration_log_pkey', 'migration_log_status_idx', 'milestones_date_idx', 'milestones_pkey', 'milestones_subsystem_id_idx', 'notifications_entity_idx', 'notifications_pkey', 'notifications_unread_idx', 'notifications_user_id_idx', 'profiles_pkey', 'purchase_request_items_legacy_id_key', 'purchase_request_items_pkey', 'purchase_request_items_purchase_request_id_idx', 'purchase_requests_legacy_id_key', 'purchase_requests_pkey', 'purchase_requests_requested_by_idx', 'purchase_requests_status_idx', 'purchase_requests_subsystem_id_idx', 'purchase_status_history_legacy_id_key', 'purchase_status_history_pkey', 'purchase_status_history_purchase_request_id_idx', 'recurring_events_day_of_week_idx', 'recurring_events_pkey', 'recurring_events_subsystem_id_idx', 'subsystem_categories_pkey', 'subsystem_categories_subsystem_name_key', 'subsystem_members_pkey', 'subsystem_members_user_id_idx', 'subsystems_name_key', 'subsystems_pkey', 'task_assignees_one_primary_idx', 'task_assignees_pkey', 'task_assignees_user_id_idx', 'task_attachments_pkey', 'task_attachments_storage_path_key', 'task_attachments_task_id_idx', 'task_comments_pkey', 'task_comments_task_id_idx', 'task_requests_pkey', 'task_requests_requester_id_idx', 'task_requests_status_idx', 'task_requests_subsystem_status_idx', 'tasks_deadline_idx', 'tasks_legacy_id_key', 'tasks_pkey', 'tasks_primary_owner_id_idx', 'tasks_status_idx', 'tasks_subsystem_id_idx', 'timeline_columns_pkey', 'timeline_columns_sort_order_key', 'timeline_milestones_column_key_idx', 'timeline_milestones_pkey']) as name),
t_funcs as (select unnest(array['admin_set_user_active', 'admin_set_user_approved', 'admin_set_user_role', 'cad_reviews_before_write', 'calendar_events_before_write', 'can_access_cad_review', 'can_access_purchase_request', 'can_access_task', 'handle_new_user', 'is_active_user', 'is_approved', 'is_cto_or_admin', 'is_subsystem_lead', 'is_subsystem_member', 'lock_subsystem_id_for_non_admin', 'log_purchase_status_change', 'migration_exceptions_before_update', 'notify_cad_review_status_change', 'notify_comment_mention', 'notify_member_application_reviewed', 'notify_purchase_status_change', 'notify_task_assignment', 'notify_task_request_reviewed', 'purchase_requests_before_write', 'set_cad_review_comment_author', 'set_cad_review_version_defaults', 'set_member_application_defaults', 'set_task_attachment_uploader', 'set_task_comment_author', 'set_task_request_defaults', 'set_timeline_milestone_metadata', 'set_updated_at', 'sync_task_primary_owner', 'task_requests_before_update', 'tasks_before_write']) as name),
t_enums as (select unnest(array['application_status', 'cad_review_status', 'migration_exception_resolution_status', 'migration_log_status', 'purchase_status', 'task_assignee_role', 'task_priority', 'task_request_status', 'task_status', 'user_role']) as name),
checks as (
  select 1 as n, 'no relation in public already uses a target TABLE or INDEX name (e.g. legacy public.tasks / tasks_pkey)' as check_name,
    coalesce((select jsonb_agg(c.relname order by c.relname)
      from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
      where ns.nspname = 'public' and c.relkind in ('r','p','v','m','f','S','i','I')
        and (c.relname in (select name from t_tables) or c.relname in (select name from t_indexes))), '[]'::jsonb) as offenders
  union all
  select 2, 'no type in public already uses a target ENUM or table-row-type name',
    coalesce((select jsonb_agg(t.typname order by t.typname)
      from pg_type t join pg_namespace ns on ns.oid = t.typnamespace
      where ns.nspname = 'public' and t.typtype in ('e','c','d')
        and (t.typname in (select name from t_enums) or t.typname in (select name from t_tables))), '[]'::jsonb)
  union all
  select 3, 'no function in public already has a target FUNCTION name (create or replace would silently overwrite it)',
    coalesce((select jsonb_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' order by p.proname)
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'public' and p.proname in (select name from t_funcs)
        and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')), '[]'::jsonb)
  union all
  select 4, 'no trigger named on_auth_user_created on auth.users',
    coalesce((select jsonb_agg(t.tgname) from pg_trigger t
      where t.tgrelid = 'auth.users'::regclass and t.tgname = 'on_auth_user_created'), '[]'::jsonb)
  union all
  select 5, 'storage bucket task-attachments does not exist yet (0017 would overwrite its limits and mime list)',
    coalesce((select jsonb_agg(b.id) from storage.buckets b where b.id = 'task-attachments'), '[]'::jsonb)
  union all
  select 6, 'no storage.objects policy named task_attachments_storage_*',
    coalesce((select jsonb_agg(p.policyname) from pg_policies p
      where p.schemaname = 'storage' and p.tablename = 'objects' and p.policyname like 'task_attachments_storage_%'), '[]'::jsonb)
  union all
  select 7, 'row level security is ENABLED on storage.objects (expected offenders: none)',
    case when (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass)
         then '[]'::jsonb else '["storage.objects has RLS disabled"]'::jsonb end
)
select jsonb_build_object(
  'all_clear', (select bool_and(jsonb_array_length(offenders) = 0) from checks),
  'checks', (select jsonb_agg(jsonb_build_object(
      'n', n, 'check', check_name, 'ok', jsonb_array_length(offenders) = 0, 'offenders', offenders) order by n) from checks),
  'info', jsonb_build_object(
    'auth_users', (select count(*) from auth.users),
    'public_relations_present', (select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb)
        from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
        where ns.nspname = 'public' and c.relkind in ('r','p','v','m','f')),
    'pgcrypto', (select coalesce(jsonb_agg(jsonb_build_object('schema', n.nspname, 'version', e.extversion)), '[]'::jsonb)
        from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgcrypto'),
    'server_version', current_setting('server_version')
  )
) as preflight;

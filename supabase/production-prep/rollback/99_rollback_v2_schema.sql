-- =========================================================
-- 99_rollback_v2_schema.sql        *** DESTRUCTIVE — NOT A MIGRATION ***
-- Phase 6.7. Removes EVERYTHING that migrations 0001-0021 create, and nothing else:
--   27 tables, 35 functions, 10 enum types, the auth.users trigger,
--   and the 2 storage.objects policies. It names every object explicitly (no wildcards, no
--   CASCADE) so it can never touch orders, subteams, workspace_state or a renamed legacy_tasks.
-- ALL DATA in the dropped tables is lost. Use ONLY before cutover, after taking an export,
-- and only with explicit approval. If it hits a dependency error nothing is dropped (one transaction).
-- Not covered by SQL (Supabase blocks direct DELETE on storage.buckets/objects): the empty
-- 'task-attachments' bucket must be removed via Dashboard > Storage, if desired.
--
-- !!! bobcat-dev IS BEING PROMOTED TO THE NEW LIVE DATABASE (decision recorded 2026-09-19). !!!
-- !!! NEVER run this on bobcat-dev: it would delete the live schema and every row in it.   !!!
-- The script therefore REFUSES TO RUN unless the same session first sets an explicit confirmation:
--     select set_config('app.confirm_rollback_v2', 'DROP-EVERYTHING', false);
-- (This guard is for a throw-away scratch/test project only.)
-- =========================================================
begin;

do $guard$
begin
  if coalesce(current_setting('app.confirm_rollback_v2', true), '') <> 'DROP-EVERYTHING' then
    raise exception 'REFUSING to drop the v2 schema: app.confirm_rollback_v2 is not set. This script destroys every v2 table and all data; it must never run on the live database.';
  end if;
end
$guard$;

drop trigger if exists on_auth_user_created on auth.users;
drop policy if exists task_attachments_storage_insert on storage.objects;
drop policy if exists task_attachments_storage_select on storage.objects;

-- one statement: Postgres resolves the foreign keys among these tables itself
drop table
  public.audit_logs,
  public.cad_review_comments,
  public.cad_review_versions,
  public.cad_reviews,
  public.calendar_events,
  public.comment_mentions,
  public.competition_settings,
  public.member_applications,
  public.migration_exceptions,
  public.migration_log,
  public.milestones,
  public.notifications,
  public.profiles,
  public.purchase_request_items,
  public.purchase_requests,
  public.purchase_status_history,
  public.recurring_events,
  public.subsystem_categories,
  public.subsystem_members,
  public.subsystems,
  public.task_assignees,
  public.task_attachments,
  public.task_comments,
  public.task_requests,
  public.tasks,
  public.timeline_columns,
  public.timeline_milestones;

drop function if exists public.admin_set_user_active(p_user_id uuid, p_active boolean);
drop function if exists public.admin_set_user_approved(p_user_id uuid, p_approved boolean);
drop function if exists public.admin_set_user_role(p_user_id uuid, p_role user_role);
drop function if exists public.cad_reviews_before_write();
drop function if exists public.calendar_events_before_write();
drop function if exists public.can_access_cad_review(p_cad_review_id uuid);
drop function if exists public.can_access_purchase_request(p_purchase_request_id uuid);
drop function if exists public.can_access_task(p_task_id uuid);
drop function if exists public.handle_new_user();
drop function if exists public.is_active_user();
drop function if exists public.is_approved();
drop function if exists public.is_cto_or_admin();
drop function if exists public.is_subsystem_lead(p_subsystem_id text);
drop function if exists public.is_subsystem_member(p_subsystem_id text);
drop function if exists public.lock_subsystem_id_for_non_admin();
drop function if exists public.log_purchase_status_change();
drop function if exists public.migration_exceptions_before_update();
drop function if exists public.notify_cad_review_status_change();
drop function if exists public.notify_comment_mention();
drop function if exists public.notify_member_application_reviewed();
drop function if exists public.notify_purchase_status_change();
drop function if exists public.notify_task_assignment();
drop function if exists public.notify_task_request_reviewed();
drop function if exists public.purchase_requests_before_write();
drop function if exists public.set_cad_review_comment_author();
drop function if exists public.set_cad_review_version_defaults();
drop function if exists public.set_member_application_defaults();
drop function if exists public.set_task_attachment_uploader();
drop function if exists public.set_task_comment_author();
drop function if exists public.set_task_request_defaults();
drop function if exists public.set_timeline_milestone_metadata();
drop function if exists public.set_updated_at();
drop function if exists public.sync_task_primary_owner();
drop function if exists public.task_requests_before_update();
drop function if exists public.tasks_before_write();

drop type if exists public.application_status;
drop type if exists public.cad_review_status;
drop type if exists public.migration_exception_resolution_status;
drop type if exists public.migration_log_status;
drop type if exists public.purchase_status;
drop type if exists public.task_assignee_role;
drop type if exists public.task_priority;
drop type if exists public.task_request_status;
drop type if exists public.task_status;
drop type if exists public.user_role;

commit;

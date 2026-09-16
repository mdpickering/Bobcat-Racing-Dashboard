-- =========================================================
-- 0012_grant_cto_admin_insert_notifications_and_exceptions.sql
-- Phase 6.2F patch — grants CTO/Admin a narrow INSERT path on
-- notifications and migration_exceptions, both gated by
-- is_cto_or_admin() in RLS. Regular members and team leads
-- remain fully unable to insert into either table — the core
-- "users cannot forge these records" guarantee is unchanged for
-- everyone except cto/admin, who legitimately need this (manual
-- notifications like subsystem announcements; manually logging
-- a migration exception). This also unblocks real end-to-end
-- testing of notification isolation and exception resolution,
-- which the zero-insert-grant design in 0011 made otherwise
-- impossible to verify without service-role access.
--
-- audit_logs and migration_log are NOT touched — they remain
-- fully closed to every role, including cto/admin, exactly as
-- 0011 defined them.
--
-- Does NOT modify 0001-0011. Does not touch workspace_state or
-- any legacy table, and does not migrate any production data.
-- Run against bobcat-dev only.
-- =========================================================

-- ---------------------------------------------------------
-- notifications: cto/admin can create a notification for any
-- user. read_at is intentionally excluded from the insert grant
-- so a new notification always starts unread (column default
-- NULL). Existing select/update-own policies are untouched.
-- ---------------------------------------------------------
create policy notifications_insert_cto_admin
  on public.notifications
  for insert
  to authenticated
  with check (public.is_cto_or_admin());

grant insert (user_id, type, title, message, entity_type, entity_id)
  on public.notifications to authenticated;

-- ---------------------------------------------------------
-- migration_exceptions: cto/admin can manually log an exception.
-- resolution_status is excluded from the insert grant so a new
-- exception always starts 'unresolved' (column default);
-- resolved_to_profile_id/resolved_by/resolved_at stay excluded
-- entirely, same as before — resolution only ever happens
-- through the existing migration_exceptions_update_resolve
-- policy and its trigger-derived stamping.
-- ---------------------------------------------------------
create policy migration_exceptions_insert_cto_admin
  on public.migration_exceptions
  for insert
  to authenticated
  with check (public.is_cto_or_admin());

grant insert (migration_batch_id, entity_type, raw_value, context)
  on public.migration_exceptions to authenticated;

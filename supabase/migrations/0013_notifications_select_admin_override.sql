-- =========================================================
-- 0013_notifications_select_admin_override.sql
-- Phase 6.2F patch — fixes a genuine defect found during
-- verification: notifications_select had no CTO/Admin
-- override, so INSERT ... RETURNING (the idiomatic
-- .insert().select() pattern) failed for CTO/Admin creating a
-- notification for someone else — the new row's user_id is the
-- recipient, not the inserter, so the inserting cto/admin could
-- never see their own just-created row, and Postgres rolls back
-- the whole statement when RETURNING can't satisfy the SELECT
-- policy (same class of bug as the original member_applications
-- finding in Phase 6.2A).
--
-- "Users must never access another user's notifications" is
-- read as being about regular members/leads, consistent with
-- every other table in this schema, where cto/admin is
-- routinely exempt from peer-level restrictions unless the
-- brief says otherwise. Regular members and team leads still
-- cannot read anyone else's notifications — only the cto/admin
-- boundary changes here.
--
-- Does NOT modify 0001-0012. Does not touch workspace_state or
-- any legacy table, and does not migrate any production data.
-- Run against bobcat-dev only.
-- =========================================================

alter policy notifications_select
  on public.notifications
  using (user_id = auth.uid() or public.is_cto_or_admin());

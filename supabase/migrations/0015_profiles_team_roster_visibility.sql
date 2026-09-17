-- =========================================================
-- 0015_profiles_team_roster_visibility.sql
-- Phase 6.3 patch — found while building the real UI:
-- profiles_select_own (0001) only allows id = auth.uid(), which
-- blocks every other table's embedded `profiles(...)` join
-- (task_assignees, subsystem_members, task_comments, etc.) from
-- resolving another user's display_name/avatar_url, since
-- PostgREST applies the target table's own RLS to embedded
-- resource selects. In practice this meant no name or avatar
-- for a task's primary owner, a subsystem's lead, a comment's
-- author, or anyone else could ever render anywhere in the
-- application — a genuine application requirement the existing
-- schema could not support, not a UI bug.
--
-- Fix: add a second, additive SELECT policy so any approved
-- user can read any OTHER approved-or-not profile row too —
-- matching the same "broad read visibility for approved team
-- members" pattern already used for subsystems/subsystem_
-- categories/timeline/calendar since 0002/0010. This does not
-- remove profiles_select_own (multiple permissive policies for
-- the same command are OR'd together, so it becomes redundant
-- but is left in place for a minimal diff) and does not touch
-- the column-level write grants at all — role/approved/active
-- remain fully unwritable by anyone but a privileged process,
-- exactly as 0001 established. Only read visibility changes.
--
-- Does NOT modify 0001-0014. Does not touch workspace_state or
-- any legacy table, and does not migrate any production data.
-- Run against bobcat-dev only.
-- =========================================================

create policy profiles_select_team
  on public.profiles
  for select
  to authenticated
  using (public.is_approved());

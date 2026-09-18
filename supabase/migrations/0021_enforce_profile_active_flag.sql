-- =========================================================
-- 0021_enforce_profile_active_flag.sql
-- Phase 6.6 fix: profiles.active was never enforced anywhere.
-- Reproduced live: after admin_set_user_active(member1, false), the
-- deactivated member's own JWT could still read tasks and insert
-- task_requests. Every RLS helper (is_approved, is_cto_or_admin,
-- is_subsystem_member, is_subsystem_lead) checked approval/role/
-- membership only, and several policies grant access purely from
-- row ownership (task assignee, CAD submitter, requester) without
-- touching those helpers — so "Deactivate" in the admin UI was
-- cosmetic.
--
-- Fix, in two layers:
--   1. The four existing helpers now also require an active
--      profile, so every policy built on them locks out
--      deactivated users automatically.
--   2. Ownership-based paths (assignee/submitter/requester) bypass
--      the helpers, so a new is_active_user() helper backs a
--      RESTRICTIVE "require_active_user" policy on every table
--      where such paths exist. A restrictive policy is AND-ed with
--      the permissive ones, so it can only narrow access, never
--      widen it. can_access_task/can_access_cad_review (used by the
--      storage.objects policies from 0017/0019) also require an
--      active user so attachment downloads lock out too.
--
-- Deliberately NOT restricted: profiles (a deactivated user must
-- still read their own row so the app can show the deactivated
-- screen), member_applications, notifications (own inbox only,
-- no shared data). Reactivation via admin_set_user_active restores
-- everything immediately — no data is touched.
--
-- create or replace preserves existing grants; revoke/grant lines
-- are re-asserted so the migration is self-contained. Does NOT
-- touch workspace_state or any legacy table. bobcat-dev only.
-- =========================================================

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and active = true
  );
$$;

revoke execute on function public.is_active_user() from public;
revoke execute on function public.is_active_user() from anon, authenticated;
grant execute on function public.is_active_user() to authenticated;

create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and approved = true and active = true
  );
$$;

create or replace function public.is_cto_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and approved = true and active = true and role in ('cto', 'admin')
  );
$$;

create or replace function public.is_subsystem_member(p_subsystem_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subsystem_members sm
    join public.profiles p on p.id = sm.user_id
    where sm.subsystem_id = p_subsystem_id and sm.user_id = auth.uid() and p.active = true
  );
$$;

create or replace function public.is_subsystem_lead(p_subsystem_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subsystem_members sm
    join public.profiles p on p.id = sm.user_id
    where sm.subsystem_id = p_subsystem_id and sm.user_id = auth.uid() and sm.is_lead = true and p.active = true
  );
$$;

create or replace function public.can_access_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user() and exists (
    select 1 from public.tasks t
    where t.id = p_task_id
      and (
        public.is_cto_or_admin()
        or public.is_subsystem_lead(t.subsystem_id)
        or (public.is_approved() and public.is_subsystem_member(t.subsystem_id))
        or t.primary_owner_id = auth.uid()
        or exists (
          select 1 from public.task_assignees ta
          where ta.task_id = t.id and ta.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.can_access_cad_review(p_cad_review_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user() and exists (
    select 1 from public.cad_reviews cr
    where cr.id = p_cad_review_id
      and (
        public.is_cto_or_admin()
        or public.is_subsystem_lead(cr.subsystem_id)
        or (public.is_approved() and public.is_subsystem_member(cr.subsystem_id))
        or cr.submitted_by = auth.uid()
      )
  );
$$;

-- Re-assert privileges on every redefined function (idempotent).
revoke execute on function public.is_approved() from public;
revoke execute on function public.is_cto_or_admin() from public;
revoke execute on function public.is_subsystem_member(text) from public;
revoke execute on function public.is_subsystem_lead(text) from public;
revoke execute on function public.can_access_task(uuid) from public;
revoke execute on function public.can_access_cad_review(uuid) from public;
revoke execute on function public.is_approved() from anon, authenticated;
revoke execute on function public.is_cto_or_admin() from anon, authenticated;
revoke execute on function public.is_subsystem_member(text) from anon, authenticated;
revoke execute on function public.is_subsystem_lead(text) from anon, authenticated;
revoke execute on function public.can_access_task(uuid) from anon, authenticated;
revoke execute on function public.can_access_cad_review(uuid) from anon, authenticated;
grant execute on function public.is_approved() to authenticated;
grant execute on function public.is_cto_or_admin() to authenticated;
grant execute on function public.is_subsystem_member(text) to authenticated;
grant execute on function public.is_subsystem_lead(text) to authenticated;
grant execute on function public.can_access_task(uuid) to authenticated;
grant execute on function public.can_access_cad_review(uuid) to authenticated;

-- Restrictive policies: AND-ed with every existing permissive policy.
create policy require_active_user on public.tasks as restrictive for all to authenticated using (public.is_active_user());
create policy require_active_user on public.task_assignees as restrictive for all to authenticated using (public.is_active_user());
create policy require_active_user on public.task_requests as restrictive for all to authenticated using (public.is_active_user());
create policy require_active_user on public.task_comments as restrictive for all to authenticated using (public.is_active_user());
create policy require_active_user on public.comment_mentions as restrictive for all to authenticated using (public.is_active_user());
create policy require_active_user on public.task_attachments as restrictive for all to authenticated using (public.is_active_user());
create policy require_active_user on public.cad_reviews as restrictive for all to authenticated using (public.is_active_user());
create policy require_active_user on public.cad_review_versions as restrictive for all to authenticated using (public.is_active_user());
create policy require_active_user on public.cad_review_comments as restrictive for all to authenticated using (public.is_active_user());

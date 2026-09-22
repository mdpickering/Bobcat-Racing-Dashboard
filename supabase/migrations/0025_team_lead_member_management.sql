-- =========================================================
-- 0025_team_lead_member_management.sql
-- New capability (owner request, post-cutover): a subsystem's own team
-- lead can add an eligible member to their subsystem's roster, without
-- needing admin to do it. Builds on 0001-0024's existing helper functions
-- and patterns; does not create a parallel roster or status system.
--
-- ---------------------------------------------------------
-- What "eligible for team assignment" means here, and why.
-- member_applications (0002) has an admin review UI, but there is no
-- live path in this app for a real sign-up to ever create a row there —
-- it is never inserted by the sign-up flow. The actual, current gate for
-- a real account is profiles.approved (owner's own explicit choice in
-- 0023: new sign-ups are now auto-approved at creation). So "eligible for
-- team assignment" = an approved, active profile that is not yet a
-- member of ANY subsystem — computed from the existing profiles /
-- subsystem_members tables, no new status field. This does not weaken
-- account security: only an already-approved, already-active profile is
-- ever assignable, and approval/activation themselves are completely
-- untouched (still admin_set_user_approved/admin_set_user_active only,
-- from 0020, both unaffected by anything below).
-- ---------------------------------------------------------

-- Narrow, reusable: "is this OTHER user an approved, active profile" —
-- is_approved()/is_active_user() (0001/0021) only ever check the caller
-- (auth.uid()); this is the same fact for an arbitrary target user.
create or replace function public.is_approved_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user_id and approved = true and active = true
  );
$$;

revoke execute on function public.is_approved_profile(uuid) from public;
revoke execute on function public.is_approved_profile(uuid) from anon, authenticated;
grant execute on function public.is_approved_profile(uuid) to authenticated;

-- ---------------------------------------------------------
-- subsystem_members: additive INSERT policy for a subsystem's own lead.
-- Permissive policies for the same command are OR'd together, so the
-- existing cto/admin-only policy from 0002 (unconditional: any
-- subsystem, any is_lead value) is completely untouched — admin/cto
-- capability does not change at all. This policy only ever lets a
-- caller insert a row for THEIR OWN led subsystem (is_subsystem_lead,
-- 0002/0021 — already checks the caller is active), with is_lead forced
-- false at the row level (so a lead can never insert someone as already-
-- a-lead) and the target user required to already be approved+active.
--
-- This is real, standalone enforcement, independent of any app code: a
-- raw REST insert that tries a different subsystem_id, is_lead=true, or
-- an unapproved target is rejected here regardless of what UI (if any)
-- made the call.
--
-- UPDATE and DELETE on subsystem_members are NOT touched by this
-- migration and remain cto/admin-only (0002) — a lead can add a member
-- to their own team, but cannot promote anyone to lead (that is an
-- UPDATE, not covered by this INSERT-only policy), cannot remove anyone,
-- and cannot change is_lead on any existing row, including rows they
-- added themselves.
-- ---------------------------------------------------------
create policy subsystem_members_insert_own_team
  on public.subsystem_members
  for insert
  to authenticated
  with check (
    is_lead = false
    and public.is_subsystem_lead(subsystem_id)
    and public.is_approved_profile(user_id)
  );

-- ---------------------------------------------------------
-- Read-side helper for the "eligible new members" list: which approved,
-- active, plain-member/team_lead-role profiles currently have NO
-- subsystem membership at all. cto/admin are excluded on purpose — they
-- have their own org-wide management path and are not "new members" a
-- team lead would be picking off an applicant list; this only changes
-- who shows up in the picker, not any admin/cto capability.
-- SECURITY DEFINER is required here specifically because
-- subsystem_members_select (0002) only lets a caller see membership rows
-- for subsystems they themselves belong to (plus their own row) — a
-- lead computing "who has zero membership anywhere" needs an org-wide
-- view of *whether* a membership row exists, without being granted
-- visibility into the full membership/roster of subsystems they don't
-- belong to. Returns only ids (a narrow, boolean-shaped fact, the same
-- philosophy as every other helper in this schema) — the caller then
-- reads the actual profile data for those ids through the normal,
-- already-existing profiles_select_team policy (0015), so no data
-- beyond what an approved user can already see is exposed here.
-- ---------------------------------------------------------
create or replace function public.list_unassigned_approved_profile_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from public.profiles p
  where p.approved = true and p.active = true and p.role in ('member', 'team_lead')
    and not exists (
      select 1 from public.subsystem_members sm where sm.user_id = p.id
    );
$$;

revoke execute on function public.list_unassigned_approved_profile_ids() from public;
revoke execute on function public.list_unassigned_approved_profile_ids() from anon, authenticated;
grant execute on function public.list_unassigned_approved_profile_ids() to authenticated;

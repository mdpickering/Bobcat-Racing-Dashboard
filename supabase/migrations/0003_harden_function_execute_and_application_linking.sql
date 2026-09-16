-- =========================================================
-- 0003_harden_function_execute_and_application_linking.sql
-- Phase 6.2A patch — fixes two findings from verification:
--   1) anon could still execute the RLS helper functions.
--   2) a member's own submitted application failed to come
--      back via INSERT ... RETURNING / .select().
-- Does NOT modify 0001_profiles.sql or
-- 0002_subsystems_and_member_applications.sql — this migration
-- only adjusts privileges/policies and adds one trigger on top
-- of the existing schema. No data is dropped. Run against
-- bobcat-dev only.
-- =========================================================

-- ---------------------------------------------------------
-- FINDING 1 — helper function EXECUTE privilege.
-- 0002 revoked EXECUTE from PUBLIC, but Supabase's default
-- ALTER DEFAULT PRIVILEGES grants EXECUTE on every new function
-- to anon and authenticated explicitly, at creation time. A
-- PUBLIC-targeted revoke does not remove an explicit per-role
-- grant. Revoke from the actual roles directly instead.
-- Function bodies, SECURITY DEFINER, and search_path = public
-- are unchanged from 0002.
-- ---------------------------------------------------------
revoke execute on function public.is_approved() from anon, authenticated;
revoke execute on function public.is_cto_or_admin() from anon, authenticated;
revoke execute on function public.is_subsystem_member(text) from anon, authenticated;
revoke execute on function public.is_subsystem_lead(text) from anon, authenticated;

grant execute on function public.is_approved() to authenticated;
grant execute on function public.is_cto_or_admin() to authenticated;
grant execute on function public.is_subsystem_member(text) to authenticated;
grant execute on function public.is_subsystem_lead(text) to authenticated;

-- ---------------------------------------------------------
-- FINDING 2 — member_applications insert/RETURNING mismatch.
-- A submitted application must be visible to its own submitter
-- immediately (for INSERT ... RETURNING / .select() to work),
-- which means linked_profile_id must equal the submitter's own
-- id at insert time. It must not be client-suppliable: the
-- insert column grant (from 0002, unchanged) already excludes
-- linked_profile_id, and this trigger additionally forces it
-- server-side regardless of what (if anything) was supplied —
-- so it can never be spoofed to another user's id even if a
-- future grant change loosened the column privilege.
-- ---------------------------------------------------------
create or replace function public.set_member_application_defaults()
returns trigger
language plpgsql
as $$
begin
  new.linked_profile_id := auth.uid();
  new.status := 'pending';
  new.reviewed_by := null;
  new.reviewed_at := null;
  return new;
end;
$$;

create trigger member_applications_set_defaults
  before insert on public.member_applications
  for each row execute function public.set_member_application_defaults();

-- The insert policy's invariant changes from "unlinked" to
-- "linked to the inserting user" — the trigger above guarantees
-- this is what ends up in the row regardless of input, and this
-- WITH CHECK documents/enforces the same invariant at the RLS
-- layer. TO authenticated is left as 0002 defined it.
alter policy member_applications_insert
  on public.member_applications
  with check (
    linked_profile_id = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

-- =========================================================
-- 0023_auto_approve_new_signups.sql
-- Owner decision (post-cutover): open self-serve sign-up no longer
-- requires manual admin approval. New accounts are auto-approved at
-- creation instead of defaulting to approved=false pending review.
--
-- Scope, deliberately narrow: only handle_new_user() (the trigger that
-- creates a profiles row for every new auth.users sign-up) changes, to
-- set approved=true explicitly. profiles.approved itself KEEPS its
-- `default false` (from 0001) — so any other insert path into profiles
-- that doesn't explicitly set approved still defaults to the safe value.
-- The only real-world effect: brand-new self-serve sign-ups, from now on.
--
-- Does NOT touch: any existing profile row (this only affects rows this
-- trigger inserts from now on — existing pending accounts, including the
-- owner's own test signups, are unaffected and still need approving once
-- via Admin -> Users, same as always), active (already defaults true,
-- untouched), role (still defaults 'member'), RLS, grants, any other
-- table, workspace_state, or the old legacy project.
--
-- Known, accepted trade-off: /signup has no invite code or email-domain
-- restriction, so anyone who finds the sign-up URL now gets a fully
-- active, approved member account immediately, with no admin review step
-- at all. If this ever needs to be restricted to a specific email domain
-- instead of wide open, that's a follow-up change to the `values` below
-- (e.g. `new.email ilike '%@your-school.edu'` in place of `true`).
--
-- Rollback: re-run 0001's original handle_new_user() body (omit
-- `approved` from the insert list, or pass `false` explicitly).
-- =========================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, year, approved)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', ''),
    coalesce(new.raw_user_meta_data->>'year', ''),
    true
  );
  return new;
end;
$$;

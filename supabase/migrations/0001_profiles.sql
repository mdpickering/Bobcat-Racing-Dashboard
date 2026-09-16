-- =========================================================
-- 0001_profiles.sql
-- Phase 6.1: identity foundation only.
-- Does NOT touch workspace_state or any legacy table.
-- Run this against the bobcat-dev Supabase project only.
-- =========================================================

create type public.user_role as enum ('member', 'team_lead', 'cto', 'admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  role public.user_role not null default 'member',
  year text,
  major text,
  skills text[],
  avatar_url text,
  active boolean not null default true,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- Auto-create a profile row whenever a new auth user signs up.
-- SECURITY DEFINER means this runs with the function owner's
-- privileges, so it can insert into profiles regardless of the
-- calling role's own grants (there are none, by design — see below).
-- ---------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, year)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', ''),
    coalesce(new.raw_user_meta_data->>'year', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------
-- Keep updated_at current on every update.
-- ---------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Row Level Security: which rows a user can touch.
-- ---------------------------------------------------------
alter table public.profiles enable row level security;

create policy profiles_select_own
  on public.profiles
  for select
  using (id = auth.uid());

create policy profiles_update_own
  on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- No insert/delete policy for the authenticated role at all —
-- profile creation is trigger-only (see handle_new_user above),
-- and deletion isn't needed yet.

-- ---------------------------------------------------------
-- Column-level privileges: which COLUMNS a user can write.
-- This is the actual enforcement for "users can never change
-- their own role, approved, or active status" — checked by
-- Postgres before RLS is even evaluated, so it holds regardless
-- of the UPDATE policy above.
-- ---------------------------------------------------------
revoke all on public.profiles from authenticated, anon;

grant select on public.profiles to authenticated;

grant update (display_name, year, major, skills, avatar_url)
  on public.profiles
  to authenticated;

-- role, approved, and active are deliberately excluded from the
-- grant above. Admin will update those fields later via a
-- server-side route using the service-role key, which bypasses
-- both RLS and these grants by design — not built in this phase.

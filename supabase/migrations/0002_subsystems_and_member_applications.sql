-- =========================================================
-- 0002_subsystems_and_member_applications.sql
-- Phase 6.2A: core database — member applications, subsystems,
-- subsystem categories, and subsystem membership/leadership.
-- Builds on 0001_profiles.sql. Does NOT touch workspace_state
-- or any legacy table. Run this against the bobcat-dev
-- Supabase project only.
-- =========================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- member_applications
-- Submitted by authenticated users as part of the existing
-- signup -> account -> profile -> pending approval flow;
-- only cto/admin can review, approve/reject, or link it to
-- a profile. No anonymous write path.
-- ---------------------------------------------------------
create type public.application_status as enum ('pending', 'approved', 'rejected');

create table public.member_applications (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  name text not null,
  email text not null,
  year text,
  experience_level text,
  weekly_hours integer check (weekly_hours is null or weekly_hours >= 0),
  skills text[],
  goals text,
  status public.application_status not null default 'pending',
  linked_profile_id uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_applications_legacy_id_key unique (legacy_id)
);

create index member_applications_status_idx on public.member_applications (status);
create index member_applications_email_idx on public.member_applications (email);
create index member_applications_linked_profile_idx on public.member_applications (linked_profile_id);

create trigger member_applications_set_updated_at
  before update on public.member_applications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- subsystems
-- id is TEXT and has no default — the caller supplies it —
-- so legacy subsystem ids can be preserved when historical
-- data is migrated in a later phase.
-- ---------------------------------------------------------
create table public.subsystems (
  id text primary key,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subsystems_name_key unique (name)
);

create trigger subsystems_set_updated_at
  before update on public.subsystems
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- subsystem_categories
-- Subsystem-specific engineering rule buckets (e.g. a
-- checklist category owned by that subsystem's lead).
-- ---------------------------------------------------------
create table public.subsystem_categories (
  id uuid primary key default gen_random_uuid(),
  subsystem_id text not null references public.subsystems(id) on delete cascade,
  name text not null,
  engineering_rule text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subsystem_categories_subsystem_name_key unique (subsystem_id, name)
);

create trigger subsystem_categories_set_updated_at
  before update on public.subsystem_categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- subsystem_members
-- Composite primary key: one membership row per user per
-- subsystem. is_lead is scoped to that one subsystem only —
-- leading Drivetrain does not make you lead of Suspension.
-- No active/archive flag: removing someone from a subsystem
-- is a real delete of the membership row (gated by RLS below),
-- not a lifecycle change on a durable record.
-- ---------------------------------------------------------
create table public.subsystem_members (
  subsystem_id text not null references public.subsystems(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_lead boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (subsystem_id, user_id)
);

create index subsystem_members_user_id_idx on public.subsystem_members (user_id);

-- ---------------------------------------------------------
-- Helper functions for RLS.
-- SECURITY DEFINER so they can check the caller's own role or
-- membership facts without the read being subject to (or
-- recursing into) the RLS policies of the tables they query.
-- Each one only ever returns a boolean, never row data, so it
-- cannot be used to exfiltrate anything beyond what the caller
-- already asserted about themselves via auth.uid(). EXECUTE is
-- revoked from PUBLIC/anon below and granted only to
-- authenticated, so they can't be called as an unauthenticated
-- side door either.
-- ---------------------------------------------------------
create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and approved = true
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
    where id = auth.uid() and approved = true and role in ('cto', 'admin')
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
    select 1 from public.subsystem_members
    where subsystem_id = p_subsystem_id and user_id = auth.uid()
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
    select 1 from public.subsystem_members
    where subsystem_id = p_subsystem_id and user_id = auth.uid() and is_lead = true
  );
$$;

revoke execute on function public.is_approved() from public;
revoke execute on function public.is_cto_or_admin() from public;
revoke execute on function public.is_subsystem_member(text) from public;
revoke execute on function public.is_subsystem_lead(text) from public;

grant execute on function public.is_approved() to authenticated;
grant execute on function public.is_cto_or_admin() to authenticated;
grant execute on function public.is_subsystem_member(text) to authenticated;
grant execute on function public.is_subsystem_lead(text) to authenticated;

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------
alter table public.member_applications enable row level security;
alter table public.subsystems enable row level security;
alter table public.subsystem_categories enable row level security;
alter table public.subsystem_members enable row level security;

-- member_applications ---------------------------------------------------
create policy member_applications_select
  on public.member_applications
  for select
  to authenticated
  using (
    public.is_cto_or_admin()
    or linked_profile_id = auth.uid()
  );

create policy member_applications_insert
  on public.member_applications
  for insert
  to authenticated
  with check (
    status = 'pending'
    and linked_profile_id is null
    and reviewed_by is null
    and reviewed_at is null
  );

create policy member_applications_update_review
  on public.member_applications
  for update
  to authenticated
  using (public.is_cto_or_admin())
  with check (public.is_cto_or_admin());

-- subsystems ---------------------------------------------------
create policy subsystems_select
  on public.subsystems
  for select
  to authenticated
  using (
    public.is_cto_or_admin()
    or (public.is_approved() and active)
  );

create policy subsystems_insert
  on public.subsystems
  for insert
  to authenticated
  with check (public.is_cto_or_admin());

create policy subsystems_update
  on public.subsystems
  for update
  to authenticated
  using (public.is_cto_or_admin())
  with check (public.is_cto_or_admin());

-- subsystem_categories ---------------------------------------------------
create policy subsystem_categories_select
  on public.subsystem_categories
  for select
  to authenticated
  using (
    public.is_cto_or_admin()
    or (
      public.is_approved()
      and active
      and exists (
        select 1 from public.subsystems s
        where s.id = subsystem_categories.subsystem_id and s.active
      )
    )
  );

create policy subsystem_categories_insert
  on public.subsystem_categories
  for insert
  to authenticated
  with check (
    public.is_cto_or_admin()
    or public.is_subsystem_lead(subsystem_id)
  );

create policy subsystem_categories_update
  on public.subsystem_categories
  for update
  to authenticated
  using (
    public.is_cto_or_admin()
    or public.is_subsystem_lead(subsystem_id)
  )
  with check (
    public.is_cto_or_admin()
    or public.is_subsystem_lead(subsystem_id)
  );

-- subsystem_members ---------------------------------------------------
create policy subsystem_members_select
  on public.subsystem_members
  for select
  to authenticated
  using (
    public.is_cto_or_admin()
    or user_id = auth.uid()
    or (public.is_approved() and public.is_subsystem_member(subsystem_id))
  );

create policy subsystem_members_insert
  on public.subsystem_members
  for insert
  to authenticated
  with check (public.is_cto_or_admin());

create policy subsystem_members_update
  on public.subsystem_members
  for update
  to authenticated
  using (public.is_cto_or_admin())
  with check (public.is_cto_or_admin());

create policy subsystem_members_delete
  on public.subsystem_members
  for delete
  to authenticated
  using (public.is_cto_or_admin());

-- ---------------------------------------------------------
-- Column/table-level privileges.
-- Same defense-in-depth pattern as 0001_profiles.sql: these
-- grants are checked by Postgres before RLS is evaluated, so
-- the restriction holds even if a policy above has a bug.
-- ---------------------------------------------------------
revoke all on public.member_applications from authenticated, anon;
revoke all on public.subsystems from authenticated, anon;
revoke all on public.subsystem_categories from authenticated, anon;
revoke all on public.subsystem_members from authenticated, anon;

grant select on public.member_applications to authenticated;
grant insert (name, email, year, experience_level, weekly_hours, skills, goals)
  on public.member_applications to authenticated;
grant update (status, linked_profile_id, reviewed_by, reviewed_at)
  on public.member_applications to authenticated;
-- No delete grant: rejected applications are archived via
-- status = 'rejected', never deleted.

grant select on public.subsystems to authenticated;
grant insert (id, name, description, active) on public.subsystems to authenticated;
grant update (name, description, active) on public.subsystems to authenticated;
-- No delete grant: retire a subsystem via active = false.

grant select on public.subsystem_categories to authenticated;
grant insert (subsystem_id, name, engineering_rule, active)
  on public.subsystem_categories to authenticated;
grant update (name, engineering_rule, active)
  on public.subsystem_categories to authenticated;
-- No delete grant: retire a category via active = false.

grant select on public.subsystem_members to authenticated;
grant insert (subsystem_id, user_id, is_lead) on public.subsystem_members to authenticated;
grant update (is_lead) on public.subsystem_members to authenticated;
grant delete on public.subsystem_members to authenticated;
-- subsystem_members has no active/archive flag of its own —
-- leaving a subsystem is a real delete of the membership row,
-- gated entirely by the subsystem_members_delete RLS policy
-- above (cto/admin only).

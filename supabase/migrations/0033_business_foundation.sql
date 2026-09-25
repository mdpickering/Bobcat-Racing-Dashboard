-- =========================================================
-- 0033_business_foundation.sql
-- Phase B: the access foundation for the Business area of the dashboard.
-- Builds on 0001-0032 and reuses their patterns (SECURITY DEFINER boolean
-- helpers with the full EXECUTE revoke, additive policies, trigger-derived
-- "who/when" fields, column-level grants). Creates two small tables and the
-- helper functions later Business phases (Sponsorships, Parts, Inventory,
-- Budget, ...) will check. Changes NO existing table, policy or function.
--
-- Business is an additional layer, NOT a global role:
--   * profiles.role (member, team_lead, coo, cto, admin) is untouched.
--   * Nothing that already exists looks at these tables, so being on the
--     Business team grants no authority over tasks, CAD, purchase approval,
--     the calendar, users or anything else — by construction.
--
-- Representation
--   business_members           one row per Business team member.
--                              is_lead = Business Lead.
--   business_responsibilities  extra Business duties on top of membership
--                              (today only 'sponsorship_lead'), so a person
--                              can be a Lead AND Sponsorship Lead, or a
--                              member AND Sponsorship Lead. Removing someone
--                              from the team removes their responsibilities.
--
-- Who can do what
--   see the Business area / team  any Business member, the COO (read-only),
--                                 cto/admin
--   add a member                  Business Lead (not as a lead), cto/admin
--   remove a member               Business Lead (non-lead members, or
--                                 themselves), cto/admin (anyone)
--   make / remove a Business Lead cto/admin only
--   appoint / remove a Sponsorship Lead (or any responsibility)
--                                 Business Lead, cto/admin
--   The last Business Lead cannot be removed except by cto/admin.
--
-- The COO gets READ-ONLY Business access by default (can_view_business());
-- every write rule requires real Business membership. A COO who is added to
-- the team then has the normal Business Member permissions.
--
-- Not part of this migration (later phases): parts, vendors, inventory,
-- budgets, sponsorships. The existing purchasing export is unchanged.
-- =========================================================

-- ---------------------------------------------------------
-- Tables
-- ---------------------------------------------------------
create table public.business_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  is_lead boolean not null default false,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now()
);

create table public.business_responsibilities (
  user_id uuid not null references public.business_members(user_id) on delete cascade,
  responsibility text not null check (responsibility in ('sponsorship_lead')),
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (user_id, responsibility)
);

-- who added / assigned is never client-supplied
create or replace function public.business_stamp_actor()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'business_members' then
    new.added_by := auth.uid();
    new.added_at := now();
  else
    new.assigned_by := auth.uid();
    new.assigned_at := now();
  end if;
  return new;
end;
$$;

create trigger business_members_stamp_actor
  before insert on public.business_members
  for each row execute function public.business_stamp_actor();

create trigger business_responsibilities_stamp_actor
  before insert on public.business_responsibilities
  for each row execute function public.business_stamp_actor();

-- ---------------------------------------------------------
-- Helpers. Same shape and hardening as is_cto_or_admin(): boolean only,
-- approved AND active, EXECUTE only for authenticated.
-- ---------------------------------------------------------
create or replace function public.is_business_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.business_members bm
      join public.profiles p on p.id = bm.user_id
     where bm.user_id = auth.uid() and p.approved = true and p.active = true
  );
$$;

create or replace function public.is_business_lead()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.business_members bm
      join public.profiles p on p.id = bm.user_id
     where bm.user_id = auth.uid() and bm.is_lead = true and p.approved = true and p.active = true
  );
$$;

create or replace function public.has_business_responsibility(p_responsibility text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.business_responsibilities br
      join public.business_members bm on bm.user_id = br.user_id
      join public.profiles p on p.id = br.user_id
     where br.user_id = auth.uid() and br.responsibility = p_responsibility
       and p.approved = true and p.active = true
  );
$$;

-- Read access to the Business area: members, the COO (read-only), cto/admin.
create or replace function public.can_view_business()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_business_member() or public.is_coo() or public.is_cto_or_admin();
$$;

-- Managing the Business team itself: Business Lead, cto/admin.
create or replace function public.can_manage_business_team()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_business_lead() or public.is_cto_or_admin();
$$;

revoke execute on function public.is_business_member() from public;
revoke execute on function public.is_business_lead() from public;
revoke execute on function public.has_business_responsibility(text) from public;
revoke execute on function public.can_view_business() from public;
revoke execute on function public.can_manage_business_team() from public;
revoke execute on function public.is_business_member() from anon, authenticated;
revoke execute on function public.is_business_lead() from anon, authenticated;
revoke execute on function public.has_business_responsibility(text) from anon, authenticated;
revoke execute on function public.can_view_business() from anon, authenticated;
revoke execute on function public.can_manage_business_team() from anon, authenticated;
grant execute on function public.is_business_member() to authenticated;
grant execute on function public.is_business_lead() to authenticated;
grant execute on function public.has_business_responsibility(text) to authenticated;
grant execute on function public.can_view_business() to authenticated;
grant execute on function public.can_manage_business_team() to authenticated;

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------
alter table public.business_members enable row level security;
alter table public.business_responsibilities enable row level security;

-- read: the Business area's roster is visible to whoever can view Business
create policy business_members_select on public.business_members
  for select to authenticated using (public.can_view_business());
create policy business_responsibilities_select on public.business_responsibilities
  for select to authenticated using (public.can_view_business());

-- add a member: cto/admin (may make a lead), or a Business Lead (never a lead).
-- The person being added must be an approved, active account.
create policy business_members_insert_admin on public.business_members
  for insert to authenticated
  with check (public.is_cto_or_admin() and public.is_approved_profile(user_id));
create policy business_members_insert_lead on public.business_members
  for insert to authenticated
  with check (public.is_business_lead() and is_lead = false and public.is_approved_profile(user_id));

-- change the lead flag: cto/admin only
create policy business_members_update_admin on public.business_members
  for update to authenticated
  using (public.is_cto_or_admin())
  with check (public.is_cto_or_admin());

-- remove a member: cto/admin (anyone); a Business Lead may remove non-lead
-- members, or themselves (stepping down)
create policy business_members_delete_admin on public.business_members
  for delete to authenticated using (public.is_cto_or_admin());
create policy business_members_delete_lead on public.business_members
  for delete to authenticated
  using (public.is_business_lead() and (is_lead = false or user_id = auth.uid()));

-- responsibilities: the team's managers appoint and remove them
create policy business_responsibilities_insert on public.business_responsibilities
  for insert to authenticated with check (public.can_manage_business_team());
create policy business_responsibilities_delete on public.business_responsibilities
  for delete to authenticated using (public.can_manage_business_team());

-- ---------------------------------------------------------
-- Column / table privileges (the coarse first gate, before RLS)
-- ---------------------------------------------------------
revoke all on public.business_members from authenticated, anon;
revoke all on public.business_responsibilities from authenticated, anon;

grant select on public.business_members to authenticated;
grant insert (user_id, is_lead) on public.business_members to authenticated;
grant update (is_lead) on public.business_members to authenticated;
grant delete on public.business_members to authenticated;
-- added_by / added_at: trigger-derived, never grantable.

grant select on public.business_responsibilities to authenticated;
grant insert (user_id, responsibility) on public.business_responsibilities to authenticated;
grant delete on public.business_responsibilities to authenticated;
-- No update grant: a responsibility is either held or not. assigned_by / assigned_at: trigger-derived.

-- ---------------------------------------------------------
-- Guard: the last Business Lead cannot be removed (or demoted) by anyone
-- except cto/admin. Skipped when there is no signed-in caller at all
-- (service role / SQL editor / a profile being deleted), so account
-- maintenance is never blocked.
-- ---------------------------------------------------------
create or replace function public.business_members_protect_last_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_lead
     and (tg_op = 'DELETE' or new.is_lead = false)
     and auth.uid() is not null
     and not public.is_cto_or_admin()
     and not exists (
       select 1 from public.business_members where is_lead = true and user_id <> old.user_id
     ) then
    raise exception 'The last Business Lead cannot be removed. Ask an admin to appoint another lead first.'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.business_members_protect_last_lead() from public;
revoke execute on function public.business_members_protect_last_lead() from anon, authenticated;

create trigger business_members_protect_last_lead
  before update or delete on public.business_members
  for each row execute function public.business_members_protect_last_lead();

-- =========================================================
-- 0007_purchasing.sql
-- Phase 6.2C: purchasing database foundation — purchase
-- requests, line items, and an auto-populated status history
-- audit trail. Builds on 0001-0006 and reuses their security
-- patterns exactly (SECURITY DEFINER helper with the full
-- public + anon + authenticated EXECUTE revoke from the 0006
-- lesson, trigger-derived audit fields, archive-over-delete).
-- Does NOT touch workspace_state or any legacy table, and does
-- not migrate any production data. Run against bobcat-dev only.
-- =========================================================

-- ---------------------------------------------------------
-- Enum: the agreed purchase workflow, plus two exception
-- states. Order matches the agreed progression; Rejected and
-- Cancelled are terminal exception states reachable from
-- earlier stages, not steps in the main sequence.
-- ---------------------------------------------------------
create type public.purchase_status as enum (
  'Draft', 'Submitted', 'Under Review', 'Approved', 'Ordered',
  'In Transit', 'Arrived in Shop', 'Completed', 'Rejected', 'Cancelled'
);

-- ---------------------------------------------------------
-- purchase_requests
-- requested_by is trigger-derived (immutable after creation).
-- reviewed_by/reviewed_at are trigger-derived, stamped only the
-- first time status crosses into Approved or Rejected — never
-- client-settable, so a requester can never fake their own
-- approval. Every request starts life as 'Draft' regardless of
-- what the client sends, even for cto/admin.
-- ---------------------------------------------------------
create table public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  subsystem_id text not null references public.subsystems(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  description text,
  vendor text,
  status public.purchase_status not null default 'Draft',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legacy_id text,
  legacy_status_raw text,
  constraint purchase_requests_legacy_id_key unique (legacy_id)
);

create index purchase_requests_subsystem_id_idx on public.purchase_requests (subsystem_id);
create index purchase_requests_status_idx on public.purchase_requests (status);
create index purchase_requests_requested_by_idx on public.purchase_requests (requested_by);

create trigger purchase_requests_set_updated_at
  before update on public.purchase_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- purchase_request_items
-- Line items are a working list, unlike the request itself —
-- delete is granted (scoped by the same RLS as everything
-- else here) so a lead can remove a line before submitting,
-- the way task_assignees allows delete but tasks does not.
-- ---------------------------------------------------------
create table public.purchase_request_items (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references public.purchase_requests(id) on delete cascade,
  description text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_cost numeric(10, 2) check (unit_cost is null or unit_cost >= 0),
  link text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legacy_id text,
  constraint purchase_request_items_legacy_id_key unique (legacy_id)
);

create index purchase_request_items_purchase_request_id_idx on public.purchase_request_items (purchase_request_id);

create trigger purchase_request_items_set_updated_at
  before update on public.purchase_request_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- purchase_status_history
-- Fully trigger-populated audit trail — no insert/update/
-- delete grant to anyone via the API at all (see grants
-- section). This is the one table in the whole schema where
-- even cto/admin only ever gets read access; the log itself
-- is written exclusively by log_purchase_status_change below.
-- ---------------------------------------------------------
create table public.purchase_status_history (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references public.purchase_requests(id) on delete cascade,
  from_status public.purchase_status,
  to_status public.purchase_status not null,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  changed_at timestamptz not null default now(),
  note text,
  legacy_id text,
  constraint purchase_status_history_legacy_id_key unique (legacy_id)
);

create index purchase_status_history_purchase_request_id_idx on public.purchase_status_history (purchase_request_id);

-- ---------------------------------------------------------
-- Helper function for RLS: "can the caller see/act on this
-- purchase request at all" — reused by purchase_request_items
-- and purchase_status_history so their access rules can never
-- drift out of sync with purchase_requests' own visibility.
-- SECURITY DEFINER so it can read purchase_requests without
-- being subject to (or recursing into) its own RLS; only ever
-- returns a boolean. EXECUTE is revoked from BOTH PUBLIC and
-- anon/authenticated explicitly, then re-granted to
-- authenticated only — applying the full lesson from 0006:
-- Postgres grants EXECUTE to PUBLIC on every new function by
-- default (a separate layer from Supabase's own default grant
-- to anon/authenticated), and both layers must be revoked or a
-- gap like the original can_access_task() one reappears.
-- ---------------------------------------------------------
create or replace function public.can_access_purchase_request(p_purchase_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.purchase_requests pr
    where pr.id = p_purchase_request_id
      and (
        public.is_cto_or_admin()
        or public.is_subsystem_lead(pr.subsystem_id)
        or (public.is_approved() and public.is_subsystem_member(pr.subsystem_id))
      )
  );
$$;

revoke execute on function public.can_access_purchase_request(uuid) from public;
revoke execute on function public.can_access_purchase_request(uuid) from anon, authenticated;
grant execute on function public.can_access_purchase_request(uuid) to authenticated;

-- ---------------------------------------------------------
-- purchase_requests: before-write trigger.
-- INSERT: forces requested_by to the caller; every request
-- starts as 'Draft' regardless of client input; reviewed_by/
-- reviewed_at start null.
-- UPDATE: requested_by is immutable. Only cto/admin may change
-- subsystem_id (mirrors tasks_before_write's rule — moving a
-- request across subsystems crosses two subsystems' scope, so
-- a single-subsystem lead can't do it; the attempt is silently
-- reverted, not errored, matching tasks). Only cto/admin may
-- transition status into 'Approved' or 'Rejected' — that
-- specific transition is a hard error for anyone else, because
-- "manage purchases for their own subsystem" explicitly does
-- not include approval authority (CTO/Admin: "full purchasing
-- access and approval" calls that out as a separate capability).
-- The first time status crosses into Approved or Rejected,
-- reviewed_by/reviewed_at are stamped from the caller and then
-- left untouched on every later update (progressing further
-- through the workflow doesn't "unapprove" anything).
-- ---------------------------------------------------------
create or replace function public.purchase_requests_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.requested_by := auth.uid();
    new.status := 'Draft';
    new.reviewed_by := null;
    new.reviewed_at := null;
  elsif tg_op = 'UPDATE' then
    new.requested_by := old.requested_by;

    if not public.is_cto_or_admin() then
      new.subsystem_id := old.subsystem_id;

      if new.status in ('Approved', 'Rejected') and old.status is distinct from new.status then
        raise exception 'Only CTO/Admin can approve or reject a purchase request';
      end if;
    end if;

    if new.status in ('Approved', 'Rejected') and old.status not in ('Approved', 'Rejected') then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    else
      new.reviewed_by := old.reviewed_by;
      new.reviewed_at := old.reviewed_at;
    end if;
  end if;

  return new;
end;
$$;

create trigger purchase_requests_before_write
  before insert or update on public.purchase_requests
  for each row execute function public.purchase_requests_before_write();

-- ---------------------------------------------------------
-- purchase_status_history: append-only audit log, populated
-- entirely by this trigger — never by direct client insert.
-- SECURITY DEFINER because it writes to a table no caller
-- (including cto/admin) has any insert grant on at all.
-- ---------------------------------------------------------
create or replace function public.log_purchase_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.purchase_status_history (purchase_request_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, auth.uid());
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.purchase_status_history (purchase_request_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

revoke execute on function public.log_purchase_status_change() from public;
revoke execute on function public.log_purchase_status_change() from anon, authenticated;

create trigger purchase_requests_log_status_change
  after insert or update on public.purchase_requests
  for each row execute function public.log_purchase_status_change();

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------
alter table public.purchase_requests enable row level security;
alter table public.purchase_request_items enable row level security;
alter table public.purchase_status_history enable row level security;

-- purchase_requests ---------------------------------------------------------
create policy purchase_requests_select
  on public.purchase_requests
  for select
  to authenticated
  using (
    public.is_cto_or_admin()
    or public.is_subsystem_lead(subsystem_id)
    or (public.is_approved() and public.is_subsystem_member(subsystem_id))
  );

create policy purchase_requests_insert
  on public.purchase_requests
  for insert
  to authenticated
  with check (
    public.is_cto_or_admin()
    or public.is_subsystem_lead(subsystem_id)
  );

create policy purchase_requests_update
  on public.purchase_requests
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

-- purchase_request_items ---------------------------------------------------------
create policy purchase_request_items_select
  on public.purchase_request_items
  for select
  to authenticated
  using (public.can_access_purchase_request(purchase_request_id));

create policy purchase_request_items_insert
  on public.purchase_request_items
  for insert
  to authenticated
  with check (
    public.is_cto_or_admin()
    or exists (
      select 1 from public.purchase_requests pr
      where pr.id = purchase_request_items.purchase_request_id and public.is_subsystem_lead(pr.subsystem_id)
    )
  );

create policy purchase_request_items_update
  on public.purchase_request_items
  for update
  to authenticated
  using (
    public.is_cto_or_admin()
    or exists (
      select 1 from public.purchase_requests pr
      where pr.id = purchase_request_items.purchase_request_id and public.is_subsystem_lead(pr.subsystem_id)
    )
  )
  with check (
    public.is_cto_or_admin()
    or exists (
      select 1 from public.purchase_requests pr
      where pr.id = purchase_request_items.purchase_request_id and public.is_subsystem_lead(pr.subsystem_id)
    )
  );

create policy purchase_request_items_delete
  on public.purchase_request_items
  for delete
  to authenticated
  using (
    public.is_cto_or_admin()
    or exists (
      select 1 from public.purchase_requests pr
      where pr.id = purchase_request_items.purchase_request_id and public.is_subsystem_lead(pr.subsystem_id)
    )
  );

-- purchase_status_history ---------------------------------------------------------
create policy purchase_status_history_select
  on public.purchase_status_history
  for select
  to authenticated
  using (public.can_access_purchase_request(purchase_request_id));

-- ---------------------------------------------------------
-- Column/table-level privileges.
-- Same defense-in-depth pattern as 0001-0006: these grants are
-- the coarse first gate (checked before RLS), RLS/triggers
-- above are the fine-grained real enforcement.
-- ---------------------------------------------------------
revoke all on public.purchase_requests from authenticated, anon;
revoke all on public.purchase_request_items from authenticated, anon;
revoke all on public.purchase_status_history from authenticated, anon;

grant select on public.purchase_requests to authenticated;
grant insert (subsystem_id, title, description, vendor) on public.purchase_requests to authenticated;
grant update (title, description, vendor, subsystem_id, status) on public.purchase_requests to authenticated;
-- requested_by, reviewed_by, reviewed_at: fully trigger-derived, never grantable.
-- legacy_id, legacy_status_raw: import-only, never grantable via the API.
-- No delete grant: purchase requests are archived via status
-- ('Cancelled'/'Rejected'), never deleted.

grant select on public.purchase_request_items to authenticated;
grant insert (purchase_request_id, description, quantity, unit_cost, link, notes)
  on public.purchase_request_items to authenticated;
grant update (description, quantity, unit_cost, link, notes)
  on public.purchase_request_items to authenticated;
grant delete on public.purchase_request_items to authenticated;
-- legacy_id: import-only, never grantable via the API.

grant select on public.purchase_status_history to authenticated;
-- No insert/update/delete grant at all: this table is written
-- exclusively by log_purchase_status_change, never by clients,
-- not even cto/admin.

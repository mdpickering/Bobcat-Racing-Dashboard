-- =========================================================
-- 0010_calendar_timeline_competition.sql
-- Phase 6.2E: calendar, recurring events, timeline (W1-W15
-- columns + per-subsystem milestone cells), standalone
-- milestones, and competition settings. Builds on 0001-0009
-- and reuses their security patterns exactly (trigger-derived
-- audit fields, silent-revert field locking for out-of-scope
-- writes, archive-over-delete). No new SECURITY DEFINER helper
-- functions are needed this phase — every RLS check here is
-- satisfied by the existing is_cto_or_admin/is_subsystem_lead/
-- is_approved functions from 0002/0003. Does NOT touch
-- workspace_state or any legacy table, and does not migrate
-- any production data. Run against bobcat-dev only.
--
-- Design note: "members can read calendar, timeline, and
-- milestone information appropriate to the application" is
-- read as broad, team-wide visibility (like subsystems/
-- categories in 0002) rather than per-subsystem-scoped (like
-- tasks/purchasing/CAD) — a shared team calendar/timeline is
-- meant to be seen by the whole team, not siloed by subsystem.
-- Every table's SELECT policy below is simply
-- "is_cto_or_admin() or is_approved()".
-- =========================================================

-- ---------------------------------------------------------
-- calendar_events
-- created_by is trigger-derived (immutable after creation).
-- Only cto/admin can change subsystem_id (including nulling it
-- out to make an event team-wide, or vice versa) — a lead's
-- authority is scoped to events already in their own subsystem.
-- ---------------------------------------------------------
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  subsystem_id text references public.subsystems(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_end_after_start check (end_time >= start_time)
);

create index calendar_events_subsystem_id_idx on public.calendar_events (subsystem_id);
create index calendar_events_start_time_idx on public.calendar_events (start_time);
create index calendar_events_created_by_idx on public.calendar_events (created_by);

create trigger calendar_events_set_updated_at
  before update on public.calendar_events
  for each row execute function public.set_updated_at();

create or replace function public.calendar_events_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    if not public.is_cto_or_admin() then
      new.subsystem_id := old.subsystem_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger calendar_events_before_write
  before insert or update on public.calendar_events
  for each row execute function public.calendar_events_before_write();

-- ---------------------------------------------------------
-- recurring_events
-- day_of_week: 0 = Sunday .. 6 = Saturday. No submitter column
-- is requested for this table (unlike calendar_events).
-- ---------------------------------------------------------
create table public.recurring_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  time_label text,
  color text,
  subsystem_id text references public.subsystems(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recurring_events_subsystem_id_idx on public.recurring_events (subsystem_id);
create index recurring_events_day_of_week_idx on public.recurring_events (day_of_week);

create trigger recurring_events_set_updated_at
  before update on public.recurring_events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- milestones
-- Standalone team/subsystem milestones (distinct from the W1-15
-- timeline grid below). Same subsystem_id lock as calendar_events.
-- ---------------------------------------------------------
create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date not null,
  subsystem_id text references public.subsystems(id) on delete set null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index milestones_subsystem_id_idx on public.milestones (subsystem_id);
create index milestones_date_idx on public.milestones (date);

create trigger milestones_set_updated_at
  before update on public.milestones
  for each row execute function public.set_updated_at();

-- Shared by recurring_events and milestones: only cto/admin may
-- move a row into/out of/between subsystems; a lead's authority
-- is scoped to rows already in their own subsystem.
create or replace function public.lock_subsystem_id_for_non_admin()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and not public.is_cto_or_admin() then
    new.subsystem_id := old.subsystem_id;
  end if;
  return new;
end;
$$;

create trigger recurring_events_before_write
  before insert or update on public.recurring_events
  for each row execute function public.lock_subsystem_id_for_non_admin();

create trigger milestones_before_write
  before insert or update on public.milestones
  for each row execute function public.lock_subsystem_id_for_non_admin();

-- ---------------------------------------------------------
-- timeline_columns
-- Supports the existing W1-W15 structure: key is the stable,
-- legacy-friendly identifier (e.g. 'w1'..'w15'), immutable after
-- creation (no update grant on it — mirrors subsystems.id vs.
-- subsystems.name: key is the permanent id, label is what
-- "rename" actually changes). sort_order is a separate integer
-- because text keys like 'w1'..'w15' do not sort correctly past
-- 'w9'. Only cto/admin ever touch this table — see policies.
-- ---------------------------------------------------------
create table public.timeline_columns (
  key text primary key,
  label text not null,
  highlight boolean not null default false,
  sort_order integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint timeline_columns_sort_order_key unique (sort_order)
);

create trigger timeline_columns_set_updated_at
  before update on public.timeline_columns
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- timeline_milestones
-- The W1-15 grid's cells: one row per (subsystem, column).
-- Composite PK means a cell is naturally unique and can be
-- upserted; clearing a cell is a real delete (same reasoning as
-- task_assignees / purchase_request_items — this is working
-- data, not a durable audit record). updated_by is trigger-
-- derived on every write, never client-settable.
-- ---------------------------------------------------------
create table public.timeline_milestones (
  subsystem_id text not null references public.subsystems(id) on delete cascade,
  timeline_column_key text not null references public.timeline_columns(key) on delete cascade,
  milestone_text text,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (subsystem_id, timeline_column_key)
);

create index timeline_milestones_column_key_idx on public.timeline_milestones (timeline_column_key);

create or replace function public.set_timeline_milestone_metadata()
returns trigger
language plpgsql
as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger timeline_milestones_before_write
  before insert or update on public.timeline_milestones
  for each row execute function public.set_timeline_milestone_metadata();

-- ---------------------------------------------------------
-- competition_settings
-- One row per season; season is the natural, immutable key.
-- Only cto/admin ever write here.
-- ---------------------------------------------------------
create table public.competition_settings (
  season text primary key,
  competition_name text,
  competition_date date,
  build_start date,
  design_freeze date,
  manufacturing_start date,
  testing_start date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger competition_settings_set_updated_at
  before update on public.competition_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------
alter table public.calendar_events enable row level security;
alter table public.recurring_events enable row level security;
alter table public.milestones enable row level security;
alter table public.timeline_columns enable row level security;
alter table public.timeline_milestones enable row level security;
alter table public.competition_settings enable row level security;

-- calendar_events ---------------------------------------------------------
create policy calendar_events_select
  on public.calendar_events
  for select
  to authenticated
  using (public.is_cto_or_admin() or public.is_approved());

create policy calendar_events_insert
  on public.calendar_events
  for insert
  to authenticated
  with check (
    public.is_cto_or_admin()
    or (subsystem_id is not null and public.is_subsystem_lead(subsystem_id))
  );

create policy calendar_events_update
  on public.calendar_events
  for update
  to authenticated
  using (
    public.is_cto_or_admin()
    or (subsystem_id is not null and public.is_subsystem_lead(subsystem_id))
  )
  with check (
    public.is_cto_or_admin()
    or (subsystem_id is not null and public.is_subsystem_lead(subsystem_id))
  );

-- recurring_events ---------------------------------------------------------
create policy recurring_events_select
  on public.recurring_events
  for select
  to authenticated
  using (public.is_cto_or_admin() or public.is_approved());

create policy recurring_events_insert
  on public.recurring_events
  for insert
  to authenticated
  with check (
    public.is_cto_or_admin()
    or (subsystem_id is not null and public.is_subsystem_lead(subsystem_id))
  );

create policy recurring_events_update
  on public.recurring_events
  for update
  to authenticated
  using (
    public.is_cto_or_admin()
    or (subsystem_id is not null and public.is_subsystem_lead(subsystem_id))
  )
  with check (
    public.is_cto_or_admin()
    or (subsystem_id is not null and public.is_subsystem_lead(subsystem_id))
  );

-- milestones ---------------------------------------------------------
create policy milestones_select
  on public.milestones
  for select
  to authenticated
  using (public.is_cto_or_admin() or public.is_approved());

create policy milestones_insert
  on public.milestones
  for insert
  to authenticated
  with check (
    public.is_cto_or_admin()
    or (subsystem_id is not null and public.is_subsystem_lead(subsystem_id))
  );

create policy milestones_update
  on public.milestones
  for update
  to authenticated
  using (
    public.is_cto_or_admin()
    or (subsystem_id is not null and public.is_subsystem_lead(subsystem_id))
  )
  with check (
    public.is_cto_or_admin()
    or (subsystem_id is not null and public.is_subsystem_lead(subsystem_id))
  );

-- timeline_columns ---------------------------------------------------------
-- Shared structural configuration — cto/admin only, full stop.
-- Leads never get a path here, matching "Team Leads cannot edit
-- shared timeline column structure."
create policy timeline_columns_select
  on public.timeline_columns
  for select
  to authenticated
  using (public.is_cto_or_admin() or public.is_approved());

create policy timeline_columns_insert
  on public.timeline_columns
  for insert
  to authenticated
  with check (public.is_cto_or_admin());

create policy timeline_columns_update
  on public.timeline_columns
  for update
  to authenticated
  using (public.is_cto_or_admin())
  with check (public.is_cto_or_admin());

-- timeline_milestones ---------------------------------------------------------
-- The actual editable cells — cto/admin or the specific
-- subsystem's lead, scoped by the row's own subsystem_id.
create policy timeline_milestones_select
  on public.timeline_milestones
  for select
  to authenticated
  using (public.is_cto_or_admin() or public.is_approved());

create policy timeline_milestones_insert
  on public.timeline_milestones
  for insert
  to authenticated
  with check (
    public.is_cto_or_admin()
    or public.is_subsystem_lead(subsystem_id)
  );

create policy timeline_milestones_update
  on public.timeline_milestones
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

create policy timeline_milestones_delete
  on public.timeline_milestones
  for delete
  to authenticated
  using (
    public.is_cto_or_admin()
    or public.is_subsystem_lead(subsystem_id)
  );

-- competition_settings ---------------------------------------------------------
create policy competition_settings_select
  on public.competition_settings
  for select
  to authenticated
  using (public.is_cto_or_admin() or public.is_approved());

create policy competition_settings_insert
  on public.competition_settings
  for insert
  to authenticated
  with check (public.is_cto_or_admin());

create policy competition_settings_update
  on public.competition_settings
  for update
  to authenticated
  using (public.is_cto_or_admin())
  with check (public.is_cto_or_admin());

-- ---------------------------------------------------------
-- Column/table-level privileges.
-- Same defense-in-depth pattern as 0001-0009: these grants are
-- the coarse first gate (checked before RLS), RLS/triggers
-- above are the fine-grained real enforcement.
-- ---------------------------------------------------------
revoke all on public.calendar_events from authenticated, anon;
revoke all on public.recurring_events from authenticated, anon;
revoke all on public.milestones from authenticated, anon;
revoke all on public.timeline_columns from authenticated, anon;
revoke all on public.timeline_milestones from authenticated, anon;
revoke all on public.competition_settings from authenticated, anon;

grant select on public.calendar_events to authenticated;
grant insert (title, description, start_time, end_time, subsystem_id, active)
  on public.calendar_events to authenticated;
grant update (title, description, start_time, end_time, subsystem_id, active)
  on public.calendar_events to authenticated;
-- created_by: trigger-derived, never grantable. No delete grant:
-- archive via active = false.

grant select on public.recurring_events to authenticated;
grant insert (title, day_of_week, time_label, color, subsystem_id, active)
  on public.recurring_events to authenticated;
grant update (title, day_of_week, time_label, color, subsystem_id, active)
  on public.recurring_events to authenticated;
-- No delete grant: archive via active = false.

grant select on public.milestones to authenticated;
grant insert (name, date, subsystem_id, description, active) on public.milestones to authenticated;
grant update (name, date, subsystem_id, description, active) on public.milestones to authenticated;
-- No delete grant: archive via active = false.

grant select on public.timeline_columns to authenticated;
grant insert (key, label, highlight, sort_order, active) on public.timeline_columns to authenticated;
grant update (label, highlight, sort_order, active) on public.timeline_columns to authenticated;
-- key: immutable after creation, never in the update grant.
-- No delete grant: archive via active = false (explicitly
-- required — "add, edit, archive, rename, reorder").

grant select on public.timeline_milestones to authenticated;
grant insert (subsystem_id, timeline_column_key, milestone_text)
  on public.timeline_milestones to authenticated;
grant update (milestone_text) on public.timeline_milestones to authenticated;
grant delete on public.timeline_milestones to authenticated;
-- updated_by: trigger-derived. subsystem_id/timeline_column_key
-- are the primary key and are not in the update grant — a cell
-- is deleted and re-created rather than moved, same as
-- subsystem_members' composite key.

grant select on public.competition_settings to authenticated;
grant insert (season, competition_name, competition_date, build_start, design_freeze, manufacturing_start, testing_start)
  on public.competition_settings to authenticated;
grant update (competition_name, competition_date, build_start, design_freeze, manufacturing_start, testing_start)
  on public.competition_settings to authenticated;
-- season: immutable after creation (the natural key). No delete
-- grant: a past season's settings are simply historical, not
-- something to remove.

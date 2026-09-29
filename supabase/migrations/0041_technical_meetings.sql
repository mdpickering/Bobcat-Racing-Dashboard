-- =========================================================
-- 0041_technical_meetings.sql
-- Technical Meeting Agenda + COO Notes: a standalone feature giving the CTO/Admin a place to run
-- technical meetings and the COO a place to act as scribe. Builds on 0001-0040 and reuses their
-- patterns exactly (SECURITY DEFINER helpers with the full PUBLIC + anon/authenticated EXECUTE
-- revoke, trigger-derived audit fields, silent-revert field locking within a single shared RLS
-- policy, never-grantable system columns, archive/no-delete-by-default, a transaction-local GUC
-- flag for the one sanctioned privileged write). Does NOT touch tasks, task_requests, milestones,
-- calendar_events, recurring_events, timeline_columns, timeline_milestones, cad_reviews,
-- purchase_requests, inventory/receiving (0038), or sponsor deletion/purge (0039/0040) — it only
-- ever reads those tables (for agenda suggestions) or creates a brand-new row in `tasks` via one
-- narrow, explicitly-gated RPC. Run against bobcat-dev only.
--
-- ROLES: this is the first feature in the schema where the COO gets LESS than cto/admin instead of
-- being bundled with them (every existing can_manage_operations()-style check treats coo/cto/admin
-- identically). Two new tiers:
--   * can_manage_meetings()      -- cto/admin only. Creates meetings, builds/reorders the agenda,
--                                    deletes an empty draft meeting, corrects a completed meeting.
--   * can_record_meeting_notes() -- coo, cto or admin. Records discussion notes/decisions, creates
--                                    action items, and creates a real task from one. A superset of
--                                    can_manage_meetings() (every manager is also a recorder).
-- An ordinary approved member gets read-only access to COMPLETED meetings only (the historical
-- record); planned/in_progress meetings are invisible to them (half-written notes never leak).
--
-- DATA MODEL: technical_meetings -> technical_meeting_agenda_items -> technical_meeting_action_items
-- (an action item may also attach directly to a meeting with no agenda item). Agenda items reference
-- their real source loosely (source_type + source_id, no FK — same shape as notifications.entity_id,
-- 0011) since a source can live in any of several tables (tasks, milestones, task_requests,
-- purchase_requests, cad_reviews) or be carried forward from a previous meeting's action item.
-- Action items point OUT at a real task via linked_task_id (like cad_reviews.task_id, 0008) — never
-- the reverse — so deleting meeting data can never touch a task, and a task's own lifecycle is
-- entirely unaffected by the meeting that spawned it.
-- =========================================================

-- ---------------------------------------------------------
-- Enums
-- ---------------------------------------------------------
create type public.meeting_status as enum ('planned', 'in_progress', 'completed');
create type public.meeting_agenda_item_status as enum ('open', 'discussed', 'deferred');
create type public.meeting_action_item_status as enum ('open', 'complete', 'cancelled');

-- ---------------------------------------------------------
-- technical_meetings
-- created_by is trigger-derived (immutable). status always starts 'planned' regardless of client
-- input. started_at/ended_at are trigger-derived from status transitions (planned->in_progress,
-- ->completed) so a meeting's duration is a real fact, not something the UI has to track itself.
-- ---------------------------------------------------------
create table public.technical_meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  meeting_date date not null,
  start_time time,
  status public.meeting_status not null default 'planned',
  started_at timestamptz,
  ended_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  summary_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index technical_meetings_meeting_date_idx on public.technical_meetings (meeting_date);
create index technical_meetings_status_idx on public.technical_meetings (status);

create trigger technical_meetings_set_updated_at
  before update on public.technical_meetings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- technical_meeting_agenda_items
-- source_type/source_id are a loose reference (no FK) to whatever real record the topic came from —
-- 'manual' topics have source_id null. A partial unique index below stops the SAME suggested source
-- from being added to one meeting's agenda twice; it does not restrict manual topics, which have no
-- source_id to collide on.
-- ---------------------------------------------------------
create table public.technical_meeting_agenda_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.technical_meetings(id) on delete cascade,
  title text not null,
  source_type text not null default 'manual'
    constraint technical_meeting_agenda_items_source_type_check
    check (source_type in ('manual', 'task', 'milestone', 'task_request', 'purchasing', 'cad', 'previous_action')),
  source_id uuid,
  sort_order integer not null default 0,
  status public.meeting_agenda_item_status not null default 'open',
  discussion_notes text,
  decision text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index technical_meeting_agenda_items_meeting_id_idx on public.technical_meeting_agenda_items (meeting_id);
create unique index technical_meeting_agenda_items_meeting_source_key
  on public.technical_meeting_agenda_items (meeting_id, source_type, source_id)
  where source_id is not null;

create trigger technical_meeting_agenda_items_set_updated_at
  before update on public.technical_meeting_agenda_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- technical_meeting_action_items
-- created_by is trigger-derived. linked_task_id and completed_at are never grantable to anyone —
-- the former is set exclusively by create_task_from_meeting_action() below (via a transaction-local
-- flag, same mechanism as reschedule_task(), 0028), the latter is derived from status exactly like
-- tasks.completed_at (0004/0028).
-- ---------------------------------------------------------
create table public.technical_meeting_action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.technical_meetings(id) on delete cascade,
  agenda_item_id uuid references public.technical_meeting_agenda_items(id) on delete set null,
  title text not null,
  description text,
  assigned_to uuid references public.profiles(id) on delete set null,
  due_date date,
  subsystem_id text references public.subsystems(id) on delete set null,
  linked_task_id uuid references public.tasks(id) on delete set null,
  status public.meeting_action_item_status not null default 'open',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index technical_meeting_action_items_meeting_id_idx on public.technical_meeting_action_items (meeting_id);
create index technical_meeting_action_items_agenda_item_id_idx on public.technical_meeting_action_items (agenda_item_id);
create index technical_meeting_action_items_assigned_to_idx on public.technical_meeting_action_items (assigned_to);
create index technical_meeting_action_items_status_idx on public.technical_meeting_action_items (status);

-- ---------------------------------------------------------
-- technical_meeting_suggestion_dismissals
-- Persists "don't suggest this again FOR THIS MEETING" (dismissal is meeting-specific, per the
-- approved design — the same source may still be suggested at a later meeting). dismissed_by is
-- trigger-derived. No update/delete grant: undoing a dismissal just means adding the topic manually.
-- ---------------------------------------------------------
create table public.technical_meeting_suggestion_dismissals (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.technical_meetings(id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  dismissed_by uuid not null references public.profiles(id) on delete restrict,
  dismissed_at timestamptz not null default now(),
  constraint technical_meeting_suggestion_dismissals_unique unique (meeting_id, source_type, source_id)
);

create index technical_meeting_suggestion_dismissals_meeting_id_idx on public.technical_meeting_suggestion_dismissals (meeting_id);

-- ---------------------------------------------------------
-- Permission helpers. Same shape/hardening as is_coo()/can_manage_operations() (0028): boolean
-- only, EXECUTE revoked from PUBLIC and anon/authenticated by name, granted only to authenticated.
-- can_manage_meetings() is deliberately NOT can_manage_operations() — the COO must NOT get manager
-- rights here the way it gets them for calendar/timeline/inventory; it is a genuinely narrower gate.
-- ---------------------------------------------------------
create or replace function public.can_manage_meetings()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_cto_or_admin();
$$;

create or replace function public.can_record_meeting_notes()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_coo() or public.is_cto_or_admin();
$$;

revoke execute on function public.can_manage_meetings() from public;
revoke execute on function public.can_manage_meetings() from anon, authenticated;
grant execute on function public.can_manage_meetings() to authenticated;

revoke execute on function public.can_record_meeting_notes() from public;
revoke execute on function public.can_record_meeting_notes() from anon, authenticated;
grant execute on function public.can_record_meeting_notes() to authenticated;

-- ---------------------------------------------------------
-- technical_meetings: before-write trigger.
-- INSERT: created_by forced to the caller; status always starts 'planned' regardless of client
-- input; started_at/ended_at start null.
-- UPDATE: created_by immutable. A caller who can record but not manage (a plain COO) may only ever
-- change summary_notes — title/meeting_date/start_time/status are silently reverted, same style as
-- tasks_before_write (0028) locking fields for a non-lead. started_at/ended_at are derived from the
-- status transition: set once entering in_progress/completed, cleared if the meeting moves back out
-- of that state (a manager "correction" reopening a meeting resets its timing).
-- ---------------------------------------------------------
create or replace function public.technical_meetings_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.status := 'planned';
    new.started_at := null;
    new.ended_at := null;
  elsif tg_op = 'UPDATE' then
    new.created_by := old.created_by;

    if not public.can_manage_meetings() then
      new.title := old.title;
      new.meeting_date := old.meeting_date;
      new.start_time := old.start_time;
      new.status := old.status;
    end if;

    if new.status = 'in_progress' and old.status = 'planned' then
      new.started_at := now();
    elsif new.status = 'planned' then
      new.started_at := null;
    else
      new.started_at := old.started_at;
    end if;

    if new.status = 'completed' and old.status is distinct from 'completed' then
      new.ended_at := now();
    elsif new.status <> 'completed' then
      new.ended_at := null;
    else
      new.ended_at := old.ended_at;
    end if;
  end if;

  return new;
end;
$$;

create trigger technical_meetings_before_write
  before insert or update on public.technical_meetings
  for each row execute function public.technical_meetings_before_write();

-- ---------------------------------------------------------
-- technical_meetings: audit trail. Meeting creation, a structural edit (title/date/time), and a
-- status transition are all "major edits" per the approved design; routine note-taking on agenda
-- items is a different table and is not audited (it would flood audit_logs with every keystroke's
-- autosave). Deletion is covered further below, alongside its own restrictive RLS policy.
-- ---------------------------------------------------------
create or replace function public.audit_meeting_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (user_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), 'meeting.created', 'technical_meeting', new.id, null, jsonb_build_object('title', new.title, 'meeting_date', new.meeting_date));
  return new;
end;
$$;

revoke execute on function public.audit_meeting_created() from public;
revoke execute on function public.audit_meeting_created() from anon, authenticated;

create trigger technical_meetings_audit_created
  after insert on public.technical_meetings
  for each row execute function public.audit_meeting_created();

create or replace function public.audit_meeting_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.title is distinct from old.title
     or new.meeting_date is distinct from old.meeting_date
     or new.start_time is distinct from old.start_time
     or new.status is distinct from old.status then
    insert into public.audit_logs (user_id, action, entity_type, entity_id, before, after)
    values (
      auth.uid(),
      case when new.status is distinct from old.status then 'meeting.status_changed' else 'meeting.updated' end,
      'technical_meeting', new.id,
      jsonb_build_object('title', old.title, 'meeting_date', old.meeting_date, 'start_time', old.start_time, 'status', old.status),
      jsonb_build_object('title', new.title, 'meeting_date', new.meeting_date, 'start_time', new.start_time, 'status', new.status)
    );
  end if;
  return new;
end;
$$;

revoke execute on function public.audit_meeting_updated() from public;
revoke execute on function public.audit_meeting_updated() from anon, authenticated;

create trigger technical_meetings_audit_updated
  after update on public.technical_meetings
  for each row execute function public.audit_meeting_updated();

create or replace function public.audit_meeting_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (user_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), 'meeting.deleted', 'technical_meeting', old.id, jsonb_build_object('title', old.title, 'meeting_date', old.meeting_date), null);
  return old;
end;
$$;

revoke execute on function public.audit_meeting_deleted() from public;
revoke execute on function public.audit_meeting_deleted() from anon, authenticated;

create trigger technical_meetings_audit_deleted
  after delete on public.technical_meetings
  for each row execute function public.audit_meeting_deleted();

-- ---------------------------------------------------------
-- technical_meeting_agenda_items: before-write trigger.
-- meeting_id is immutable. A caller who can record but not manage (a plain COO) may only change
-- discussion_notes/decision/status — title/source_type/source_id/sort_order (the agenda's actual
-- structure) are manager-only and silently reverted otherwise, same style as above.
-- ---------------------------------------------------------
create or replace function public.technical_meeting_agenda_items_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    new.meeting_id := old.meeting_id;
    if not public.can_manage_meetings() then
      new.title := old.title;
      new.source_type := old.source_type;
      new.source_id := old.source_id;
      new.sort_order := old.sort_order;
    end if;
  end if;
  return new;
end;
$$;

create trigger technical_meeting_agenda_items_before_write
  before update on public.technical_meeting_agenda_items
  for each row execute function public.technical_meeting_agenda_items_before_write();

-- ---------------------------------------------------------
-- technical_meeting_action_items: before-write trigger.
-- INSERT: created_by forced to the caller; status always starts 'open'; linked_task_id/completed_at
-- start null regardless of client input. UPDATE: created_by is immutable. linked_task_id can only be
-- changed by create_task_from_meeting_action() below, via the bobcat.meeting_link_task
-- transaction-local flag (same mechanism as reschedule_task()'s bobcat.reschedule_task, 0028) — a
-- plain client UPDATE can never set it, even though the column has no grant anyway; this is the
-- second, redundant layer of protection triggers give everywhere else in this schema.
-- completed_at is derived from status exactly like tasks.completed_at.
-- ---------------------------------------------------------
create or replace function public.technical_meeting_action_items_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.status := 'open';
    new.linked_task_id := null;
    new.completed_at := null;
  elsif tg_op = 'UPDATE' then
    new.created_by := old.created_by;

    if current_setting('bobcat.meeting_link_task', true) is distinct from 'true' then
      new.linked_task_id := old.linked_task_id;
    end if;

    if new.status = 'complete' and old.status is distinct from 'complete' then
      new.completed_at := now();
    elsif new.status <> 'complete' then
      new.completed_at := null;
    else
      new.completed_at := old.completed_at;
    end if;
  end if;
  return new;
end;
$$;

create trigger technical_meeting_action_items_before_write
  before insert or update on public.technical_meeting_action_items
  for each row execute function public.technical_meeting_action_items_before_write();

-- ---------------------------------------------------------
-- technical_meeting_action_items: notify the assignee, same shape/exclusions as
-- notify_task_assignment() (0016) — skip notifying the acting user about their own action, and only
-- fire when assigned_to is actually set or actually changes.
-- ---------------------------------------------------------
create or replace function public.notify_meeting_action_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meeting_title text;
begin
  if new.assigned_to is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then
    return new;
  end if;
  if new.assigned_to = auth.uid() then
    return new;
  end if;

  select title into v_meeting_title from public.technical_meetings where id = new.meeting_id;

  insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
  values (
    new.assigned_to,
    'meeting_action_assigned',
    'You were assigned a meeting action item',
    coalesce(v_meeting_title, new.title),
    'technical_meeting_action_item',
    new.id
  );

  return new;
end;
$$;

revoke execute on function public.notify_meeting_action_assignment() from public;
revoke execute on function public.notify_meeting_action_assignment() from anon, authenticated;

create trigger technical_meeting_action_items_notify_assignment
  after insert or update on public.technical_meeting_action_items
  for each row execute function public.notify_meeting_action_assignment();

-- ---------------------------------------------------------
-- technical_meeting_suggestion_dismissals: lock dismissed_by to the caller.
-- ---------------------------------------------------------
create or replace function public.set_meeting_suggestion_dismissed_by()
returns trigger
language plpgsql
as $$
begin
  new.dismissed_by := auth.uid();
  return new;
end;
$$;

create trigger technical_meeting_suggestion_dismissals_set_dismissed_by
  before insert on public.technical_meeting_suggestion_dismissals
  for each row execute function public.set_meeting_suggestion_dismissed_by();

-- ---------------------------------------------------------
-- create_task_from_meeting_action(): the one sanctioned way an action item becomes a real task.
-- Row-locks the action item first so two concurrent calls cannot both pass the "not already linked"
-- check and create two tasks (see the rehearsal script's concurrency test). Reuses the exact task
-- creation path (a plain insert into tasks, which tasks_before_write (0028) still processes
-- normally) rather than maintaining any parallel task-storage. Assigning the action item's owner as
-- the task's primary owner goes through task_assignees, so it fires notify_task_assignment() (0016)
-- itself — a second "task created" notification here would be redundant noise.
-- ---------------------------------------------------------
create or replace function public.create_task_from_meeting_action(p_action_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action public.technical_meeting_action_items;
  v_task_id uuid;
begin
  if not public.can_record_meeting_notes() then
    raise exception 'Only a meeting manager or recorder can create a task from a meeting action' using errcode = '42501';
  end if;

  select * into v_action from public.technical_meeting_action_items where id = p_action_item_id for update;
  if not found then
    raise exception 'Meeting action item not found' using errcode = 'P0002';
  end if;

  if v_action.linked_task_id is not null then
    raise exception 'This action item is already linked to a task' using errcode = '23505';
  end if;

  if v_action.subsystem_id is null then
    raise exception 'A subsystem is required to create a task from this action item' using errcode = '23514';
  end if;

  insert into public.tasks (title, description, subsystem_id, deadline)
  values (
    v_action.title,
    v_action.description,
    v_action.subsystem_id,
    case when v_action.due_date is null then null else (v_action.due_date::timestamp at time zone 'UTC') end
  )
  returning id into v_task_id;

  if v_action.assigned_to is not null then
    insert into public.task_assignees (task_id, user_id, role) values (v_task_id, v_action.assigned_to, 'primary');
  end if;

  perform set_config('bobcat.meeting_link_task', 'true', true);
  update public.technical_meeting_action_items set linked_task_id = v_task_id where id = p_action_item_id;
  perform set_config('bobcat.meeting_link_task', '', true);

  insert into public.audit_logs (user_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), 'meeting_action_item.task_created', 'technical_meeting_action_item', p_action_item_id, null, jsonb_build_object('task_id', v_task_id));

  return v_task_id;
end;
$$;

revoke execute on function public.create_task_from_meeting_action(uuid) from public;
revoke execute on function public.create_task_from_meeting_action(uuid) from anon, authenticated;
grant execute on function public.create_task_from_meeting_action(uuid) to authenticated;

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------
alter table public.technical_meetings enable row level security;
alter table public.technical_meeting_agenda_items enable row level security;
alter table public.technical_meeting_action_items enable row level security;
alter table public.technical_meeting_suggestion_dismissals enable row level security;

-- technical_meetings ---------------------------------------------------------
create policy technical_meetings_select
  on public.technical_meetings
  for select
  to authenticated
  using (
    public.can_record_meeting_notes()
    or (public.is_approved() and status = 'completed')
  );

-- Only cto/admin may create a meeting — the COO is a recorder within one that already exists, not a
-- meeting owner, per the approved design.
create policy technical_meetings_insert
  on public.technical_meetings
  for insert
  to authenticated
  with check (public.can_manage_meetings());

create policy technical_meetings_update
  on public.technical_meetings
  for update
  to authenticated
  using (public.can_record_meeting_notes())
  with check (public.can_record_meeting_notes());

-- A completed meeting with any real content is permanent history (no precedent in this schema for
-- deleting a workflow entity once it has real data — tasks/purchase_requests/cad_reviews all default
-- to no delete at all). The only deletable case is an accidental empty draft: still 'planned', with
-- no agenda item carrying notes/decisions and no action items at all yet.
create policy technical_meetings_delete
  on public.technical_meetings
  for delete
  to authenticated
  using (
    public.can_manage_meetings()
    and status = 'planned'
    and not exists (
      select 1 from public.technical_meeting_agenda_items ai
      where ai.meeting_id = technical_meetings.id
        and (coalesce(ai.discussion_notes, '') <> '' or coalesce(ai.decision, '') <> '')
    )
    and not exists (
      select 1 from public.technical_meeting_action_items act
      where act.meeting_id = technical_meetings.id
    )
  );

-- technical_meeting_agenda_items ---------------------------------------------------------
create policy technical_meeting_agenda_items_select
  on public.technical_meeting_agenda_items
  for select
  to authenticated
  using (
    exists (
      select 1 from public.technical_meetings m
      where m.id = technical_meeting_agenda_items.meeting_id
        and (public.can_record_meeting_notes() or (public.is_approved() and m.status = 'completed'))
    )
  );

-- Building the agenda (adding/removing topics) is a manager job; the recorder works within an
-- agenda the manager has already built. Managers may still add a topic to a completed meeting as a
-- correction, per the approved design.
create policy technical_meeting_agenda_items_insert
  on public.technical_meeting_agenda_items
  for insert
  to authenticated
  with check (
    public.can_manage_meetings()
    and exists (select 1 from public.technical_meetings m where m.id = meeting_id)
  );

-- Recording notes/decisions/status is allowed while the meeting is still open; once completed, only
-- a manager may still edit (a correction), not a plain COO-as-recorder.
create policy technical_meeting_agenda_items_update
  on public.technical_meeting_agenda_items
  for update
  to authenticated
  using (
    exists (
      select 1 from public.technical_meetings m
      where m.id = technical_meeting_agenda_items.meeting_id
        and ((m.status <> 'completed' and public.can_record_meeting_notes()) or public.can_manage_meetings())
    )
  )
  with check (
    exists (
      select 1 from public.technical_meetings m
      where m.id = technical_meeting_agenda_items.meeting_id
        and ((m.status <> 'completed' and public.can_record_meeting_notes()) or public.can_manage_meetings())
    )
  );

create policy technical_meeting_agenda_items_delete
  on public.technical_meeting_agenda_items
  for delete
  to authenticated
  using (public.can_manage_meetings());

-- technical_meeting_action_items ---------------------------------------------------------
create policy technical_meeting_action_items_select
  on public.technical_meeting_action_items
  for select
  to authenticated
  using (
    exists (
      select 1 from public.technical_meetings m
      where m.id = technical_meeting_action_items.meeting_id
        and (public.can_record_meeting_notes() or (public.is_approved() and m.status = 'completed'))
    )
  );

create policy technical_meeting_action_items_insert
  on public.technical_meeting_action_items
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.technical_meetings m
      where m.id = meeting_id
        and ((m.status <> 'completed' and public.can_record_meeting_notes()) or public.can_manage_meetings())
    )
  );

create policy technical_meeting_action_items_update
  on public.technical_meeting_action_items
  for update
  to authenticated
  using (
    exists (
      select 1 from public.technical_meetings m
      where m.id = technical_meeting_action_items.meeting_id
        and ((m.status <> 'completed' and public.can_record_meeting_notes()) or public.can_manage_meetings())
    )
  )
  with check (
    exists (
      select 1 from public.technical_meetings m
      where m.id = technical_meeting_action_items.meeting_id
        and ((m.status <> 'completed' and public.can_record_meeting_notes()) or public.can_manage_meetings())
    )
  );

create policy technical_meeting_action_items_delete
  on public.technical_meeting_action_items
  for delete
  to authenticated
  using (public.can_manage_meetings());

-- technical_meeting_suggestion_dismissals ---------------------------------------------------------
create policy technical_meeting_suggestion_dismissals_select
  on public.technical_meeting_suggestion_dismissals
  for select
  to authenticated
  using (public.can_record_meeting_notes());

-- "Only the meeting manager or recorder for that meeting should be able to dismiss a suggestion":
-- can_record_meeting_notes() (coo/cto/admin) is exactly that union, since every manager is already a
-- recorder. Dismissing only makes sense while the meeting is still being planned/run.
create policy technical_meeting_suggestion_dismissals_insert
  on public.technical_meeting_suggestion_dismissals
  for insert
  to authenticated
  with check (
    public.can_record_meeting_notes()
    and exists (select 1 from public.technical_meetings m where m.id = meeting_id and m.status <> 'completed')
  );

-- ---------------------------------------------------------
-- Column/table-level privileges.
-- Same defense-in-depth pattern as every prior migration: these grants are the coarse first gate
-- (checked before RLS), RLS/triggers above are the fine-grained real enforcement.
-- ---------------------------------------------------------
revoke all on public.technical_meetings from authenticated, anon;
revoke all on public.technical_meeting_agenda_items from authenticated, anon;
revoke all on public.technical_meeting_action_items from authenticated, anon;
revoke all on public.technical_meeting_suggestion_dismissals from authenticated, anon;

grant select on public.technical_meetings to authenticated;
grant insert (title, meeting_date, start_time) on public.technical_meetings to authenticated;
grant update (title, meeting_date, start_time, status, summary_notes) on public.technical_meetings to authenticated;
grant delete on public.technical_meetings to authenticated;
-- created_by, started_at, ended_at: fully trigger-derived, never grantable.

grant select on public.technical_meeting_agenda_items to authenticated;
grant insert (meeting_id, title, source_type, source_id, sort_order) on public.technical_meeting_agenda_items to authenticated;
grant update (title, source_type, source_id, sort_order, status, discussion_notes, decision) on public.technical_meeting_agenda_items to authenticated;
grant delete on public.technical_meeting_agenda_items to authenticated;

grant select on public.technical_meeting_action_items to authenticated;
grant insert (meeting_id, agenda_item_id, title, description, assigned_to, due_date, subsystem_id) on public.technical_meeting_action_items to authenticated;
grant update (title, description, assigned_to, due_date, subsystem_id, status) on public.technical_meeting_action_items to authenticated;
grant delete on public.technical_meeting_action_items to authenticated;
-- created_by, linked_task_id, completed_at: fully trigger/RPC-derived, never grantable. status has
-- no insert grant either (the before-write trigger forces it to 'open' on every INSERT regardless);
-- it is only grantable for UPDATE, to mark an existing action item complete/cancelled.

grant select on public.technical_meeting_suggestion_dismissals to authenticated;
grant insert (meeting_id, source_type, source_id) on public.technical_meeting_suggestion_dismissals to authenticated;
-- dismissed_by: trigger-derived. No update/delete grant: a dismissal is permanent for that meeting.

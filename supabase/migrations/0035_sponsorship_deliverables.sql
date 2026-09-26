-- =========================================================
-- 0035_sponsorship_deliverables.sql
-- Phase C2: operational tracking of what each sponsor is owed. Builds on 0033
-- (Business access), 0034 (Sponsorships) and 0029 (email notification
-- preferences) and reuses their patterns: SECURITY DEFINER helpers with the full
-- EXECUTE revoke, column-level grants, trigger-derived who/when fields, an
-- append-only history log, and the notifications + email-preference catalog.
--
-- Changes NO existing table, policy, grant or function, with two purely
-- additive exceptions:
--   * sponsorship_history.kind also accepts 'deliverable' (the log records
--     deliverable events). The client insert policy still only accepts 'note'.
--   * two rows in the 0029 notification catalogs (a new email category and the
--     notification type mapped to it).
-- set_sponsorship_level() is NOT edited: a trigger on sponsorships reacts to the
-- level change, so the 0034 decision/level path is exactly as approved.
--
-- Model
--   sponsorship_deliverables   one row per thing a sponsor is owed, per
--                              sponsorship. Standard rows are copied from the
--                              level's template (template_id, source =
--                              'standard'); custom rows are added by hand.
--
-- Rules the database enforces (nothing here relies on the frontend)
--   * Deliverables follow a LEVEL DECISION. A row can only exist for a
--     sponsorship whose decision is qualified / exception / custom, never for a
--     historical_unassigned (or undecided) one. The 11 imported historical
--     sponsorships therefore stay without deliverables, and stay that way until
--     someone deliberately gives one a real level.
--   * Standard level  -> the level's templates are copied in automatically.
--     Setting or changing a level only ADDS what is missing. It never deletes,
--     duplicates or resets anything, and never touches completed work. The same
--     title can exist once per sponsorship (case-insensitive), so "Logo
--     received" from Gold is not repeated when the sponsor moves to Platinum.
--   * Custom sponsorship -> nothing is generated; a manager adds deliverables.
--   * The assignee must be an ACTIVE Business member (checked whenever the
--     assignee is set or changed).
--   * An assignee may change ONLY the status and notes of their own deliverable.
--     Managers (Sponsorship Lead, Business Lead, cto/admin) change anything.
--   * completed_at / completed_by are derived by the database from the status
--     and can never be written by a client. Moving a deliverable back out of
--     Complete clears them (so no stale "completed by" is left on an open item);
--     the sponsorship history keeps the record that it was completed and reopened.
--   * Assigning (or reassigning) to someone else creates one in-app notification,
--     and an email through the existing per-user email preference.
--
-- Who can do what
--   read     Business members, the COO (read-only), cto/admin
--   manage   Sponsorship Lead, Business Lead, cto/admin: create, edit, assign,
--            re-date, change status, delete (a completed one only by cto/admin)
--   update   the assigned Business member: status + notes on their own rows only
-- =========================================================

-- ---------------------------------------------------------
-- History log: allow deliverable events (additive)
-- ---------------------------------------------------------
do $$
declare
  c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.sponsorship_history'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%stage_change%'
  loop
    execute format('alter table public.sponsorship_history drop constraint %I', c);
  end loop;
end
$$;

alter table public.sponsorship_history
  add constraint sponsorship_history_kind_check
  check (kind in ('note', 'stage_change', 'level_decision', 'contribution', 'payment', 'availability', 'deliverable'));

-- ---------------------------------------------------------
-- Table
-- ---------------------------------------------------------
create table public.sponsorship_deliverables (
  id uuid primary key default gen_random_uuid(),
  sponsorship_id uuid not null references public.sponsorships(id) on delete restrict,
  title text not null check (btrim(title) <> ''),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'complete')),
  -- must be an active Business member (validated by the trigger below)
  assigned_to uuid references public.profiles(id) on delete set null,
  due_date date,
  -- derived by the database from the status; never client-supplied
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  notes text,
  -- where it came from: a copy of a level template, or added by hand
  template_id uuid references public.sponsorship_level_deliverables(id) on delete set null,
  source text not null default 'custom' check (source in ('standard', 'custom')),
  sort_order integer not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- completion metadata exists exactly when the deliverable is Complete
  constraint deliverables_completion_shape check ((status = 'complete') = (completed_at is not null)),
  constraint deliverables_completed_by_shape check (completed_by is null or status = 'complete')
);

create index sponsorship_deliverables_sponsorship_idx on public.sponsorship_deliverables (sponsorship_id, sort_order);
create index sponsorship_deliverables_assignee_idx on public.sponsorship_deliverables (assigned_to) where assigned_to is not null;
-- duplicate protection: one deliverable per title per sponsorship (case-insensitive)
create unique index sponsorship_deliverables_title_unique on public.sponsorship_deliverables (sponsorship_id, lower(btrim(title)));

-- ---------------------------------------------------------
-- Validation, stamping and the assignee restriction
-- ---------------------------------------------------------
create or replace function public.sponsorship_deliverables_before_write()
returns trigger
language plpgsql
as $$
begin
  new.title := btrim(new.title);

  if tg_op = 'INSERT' then
    -- deliverables follow a level decision; historical / undecided sponsorships have none
    if not exists (
      select 1
        from public.sponsorships s
        join public.sponsorship_level_decisions d on d.id = s.level_decision_id
       where s.id = new.sponsorship_id and d.method <> 'historical_unassigned'
    ) then
      raise exception 'Deliverables can only be added once the sponsorship has a level (or custom terms)' using errcode = '23514';
    end if;
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
    if new.sort_order is null then
      select coalesce(max(sort_order), 0) + 1 into new.sort_order from public.sponsorship_deliverables where sponsorship_id = new.sponsorship_id;
    end if;
  else
    if new.sponsorship_id is distinct from old.sponsorship_id then
      raise exception 'A deliverable cannot be moved to another sponsorship' using errcode = '42501';
    end if;
    -- a signed-in caller who is not a manager (the assignee) may change status and notes only
    if auth.uid() is not null and not public.can_manage_sponsorships() then
      if (new.title, new.assigned_to, new.due_date, new.template_id, new.source, new.sort_order)
         is distinct from
         (old.title, old.assigned_to, old.due_date, old.template_id, old.source, old.sort_order) then
        raise exception 'You can only change the status and notes of a deliverable assigned to you' using errcode = '42501';
      end if;
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.template_id := old.template_id;
    new.source := old.source;
    new.updated_at := now();
  end if;

  -- the assignee is a Business member, checked whenever it is set or changed
  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
     and not public.is_business_member_user(new.assigned_to) then
    raise exception 'A deliverable can only be assigned to an active Business member' using errcode = '23514';
  end if;

  -- completion metadata is always derived
  if new.status = 'complete' then
    if tg_op = 'UPDATE' and old.status = 'complete' then
      new.completed_at := old.completed_at;
      new.completed_by := old.completed_by;
    else
      new.completed_at := now();
      new.completed_by := auth.uid();
    end if;
  else
    new.completed_at := null;
    new.completed_by := null;
  end if;

  return new;
end;
$$;

create trigger sponsorship_deliverables_before_write before insert or update on public.sponsorship_deliverables
  for each row execute function public.sponsorship_deliverables_before_write();

-- ---------------------------------------------------------
-- History + assignment notification
-- One in-app notification per real assignment change; the 0029 trigger on
-- notifications then decides (from the recipient's preference) whether an email
-- is queued. A save that does not change the assignee notifies nobody.
-- ---------------------------------------------------------
create or replace function public.sponsorship_deliverables_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_sponsor text;
  v_season text;
  v_label text;
begin
  if tg_op = 'DELETE' then
    insert into public.sponsorship_history (sponsorship_id, kind, body, details, created_by)
    values (old.sponsorship_id, 'deliverable', 'Removed deliverable "' || old.title || '"',
            jsonb_build_object('deliverable_id', old.id, 'event', 'removed', 'status', old.status), auth.uid());
    return old;
  end if;

  if tg_op = 'INSERT' then
    -- standard rows are summarised once by create_standard_deliverables(); only hand-added ones log here
    if new.source = 'custom' then
      insert into public.sponsorship_history (sponsorship_id, kind, body, details, created_by)
      values (new.sponsorship_id, 'deliverable', 'Added deliverable "' || new.title || '"',
              jsonb_build_object('deliverable_id', new.id, 'event', 'added'), auth.uid());
    end if;
  else
    if new.status is distinct from old.status then
      v_label := case new.status when 'not_started' then 'Not started' when 'in_progress' then 'In progress' else 'Complete' end;
      insert into public.sponsorship_history (sponsorship_id, kind, body, details, created_by)
      values (new.sponsorship_id, 'deliverable',
              case when new.status = 'complete' then '"' || new.title || '" marked complete'
                   when old.status = 'complete' then '"' || new.title || '" reopened (' || v_label || ')'
                   else '"' || new.title || '": ' || v_label end,
              jsonb_build_object('deliverable_id', new.id, 'event', 'status', 'from', old.status, 'to', new.status,
                                 'was_completed_at', old.completed_at, 'was_completed_by', old.completed_by),
              auth.uid());
    end if;
    if new.assigned_to is distinct from old.assigned_to then
      select coalesce(display_name, email) into v_name from public.profiles where id = new.assigned_to;
      insert into public.sponsorship_history (sponsorship_id, kind, body, details, created_by)
      values (new.sponsorship_id, 'deliverable',
              case when new.assigned_to is null then '"' || new.title || '" unassigned'
                   else '"' || new.title || '" assigned to ' || coalesce(v_name, 'a Business member') end,
              jsonb_build_object('deliverable_id', new.id, 'event', 'assigned', 'from', old.assigned_to, 'to', new.assigned_to),
              auth.uid());
    end if;
    if new.due_date is distinct from old.due_date then
      insert into public.sponsorship_history (sponsorship_id, kind, body, details, created_by)
      values (new.sponsorship_id, 'deliverable',
              case when new.due_date is null then '"' || new.title || '" due date cleared'
                   else '"' || new.title || '" due ' || to_char(new.due_date, 'Mon FMDD, YYYY') end,
              jsonb_build_object('deliverable_id', new.id, 'event', 'due_date', 'from', old.due_date, 'to', new.due_date),
              auth.uid());
    end if;
    if new.title is distinct from old.title then
      insert into public.sponsorship_history (sponsorship_id, kind, body, details, created_by)
      values (new.sponsorship_id, 'deliverable', 'Renamed deliverable "' || old.title || '" to "' || new.title || '"',
              jsonb_build_object('deliverable_id', new.id, 'event', 'renamed'), auth.uid());
    end if;
  end if;

  -- notify a NEW assignee (never yourself, never on an unchanged assignee)
  if new.assigned_to is not null
     and new.assigned_to is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    select sp.name, s.season into v_sponsor, v_season
      from public.sponsorships s join public.sponsors sp on sp.id = s.sponsor_id
     where s.id = new.sponsorship_id;
    insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
    values (new.assigned_to, 'sponsorship_deliverable_assigned', 'You were assigned a sponsorship deliverable',
            new.title || ' — ' || coalesce(v_sponsor, 'a sponsor') || ' (' || coalesce(v_season, '') || ')',
            'sponsorship', new.sponsorship_id);
  end if;

  return new;
end;
$$;

revoke execute on function public.sponsorship_deliverables_after_write() from public;
revoke execute on function public.sponsorship_deliverables_after_write() from anon, authenticated;

create trigger sponsorship_deliverables_after_write after insert or update or delete on public.sponsorship_deliverables
  for each row execute function public.sponsorship_deliverables_after_write();

-- ---------------------------------------------------------
-- Standard deliverables from the level's templates
-- Adds whatever is missing and nothing else: safe to run any number of times,
-- never deletes, never resets, never touches completed work.
-- ---------------------------------------------------------
create or replace function public.create_standard_deliverables(p_sponsorship_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level uuid;
  v_level_name text;
  v_count integer;
begin
  select s.level_id, lv.name into v_level, v_level_name
    from public.sponsorships s
    left join public.sponsorship_levels lv on lv.id = s.level_id
   where s.id = p_sponsorship_id;
  if v_level is null then
    return 0;
  end if;

  with added as (
    insert into public.sponsorship_deliverables (sponsorship_id, title, sort_order, template_id, source)
    select p_sponsorship_id, t.title, t.sort_order, t.id, 'standard'
      from public.sponsorship_level_deliverables t
     where t.level_id = v_level
     order by t.sort_order, t.title
    on conflict do nothing
    returning 1
  )
  select count(*) into v_count from added;

  if v_count > 0 then
    insert into public.sponsorship_history (sponsorship_id, kind, body, details, created_by)
    values (p_sponsorship_id, 'deliverable',
            'Added ' || v_count || ' standard deliverable' || case when v_count = 1 then '' else 's' end || ' for ' || v_level_name,
            jsonb_build_object('event', 'standard_added', 'level_id', v_level, 'count', v_count), auth.uid());
  end if;
  return v_count;
end;
$$;

revoke execute on function public.create_standard_deliverables(uuid) from public;
revoke execute on function public.create_standard_deliverables(uuid) from anon, authenticated;

-- Reacts to set_sponsorship_level() (the only writer of level_id). Fires when a real level is
-- recorded, including re-setting the same level, which is how missing rows get added back.
create or replace function public.sponsorships_generate_deliverables()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.create_standard_deliverables(new.id);
  return new;
end;
$$;

revoke execute on function public.sponsorships_generate_deliverables() from public;
revoke execute on function public.sponsorships_generate_deliverables() from anon, authenticated;

create trigger sponsorships_generate_deliverables after update of level_id, level_decision_id on public.sponsorships
  for each row
  when (new.level_id is not null and (old.level_id is distinct from new.level_id or old.level_decision_id is distinct from new.level_decision_id))
  execute function public.sponsorships_generate_deliverables();

-- ---------------------------------------------------------
-- Progress (derived; nothing stored twice). security_invoker: applies the
-- caller's own row-level security. A sponsorship with no deliverables has NO row
-- here, so "no obligations recorded" is never shown as a 0 / 0 progress figure.
-- ---------------------------------------------------------
create view public.sponsorship_deliverable_progress with (security_invoker = true) as
select
  sponsorship_id,
  count(*)::integer as total,
  (count(*) filter (where status = 'complete'))::integer as completed,
  (count(*) filter (where status = 'in_progress'))::integer as in_progress
from public.sponsorship_deliverables
group by sponsorship_id;

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------
alter table public.sponsorship_deliverables enable row level security;

create policy sponsorship_deliverables_select on public.sponsorship_deliverables
  for select to authenticated using (public.can_view_business());

create policy sponsorship_deliverables_insert on public.sponsorship_deliverables
  for insert to authenticated with check (public.can_manage_sponsorships());

-- managers change anything; the assigned, active Business member changes their own row
-- (the trigger limits them to status + notes; WITH CHECK stops them handing it to someone else)
create policy sponsorship_deliverables_update on public.sponsorship_deliverables
  for update to authenticated
  using (public.can_manage_sponsorships() or (assigned_to = auth.uid() and public.is_business_member()))
  with check (public.can_manage_sponsorships() or (assigned_to = auth.uid() and public.is_business_member()));

-- completed work is only removed by cto/admin
create policy sponsorship_deliverables_delete on public.sponsorship_deliverables
  for delete to authenticated
  using (public.can_manage_sponsorships() and (status <> 'complete' or public.is_cto_or_admin()));

-- ---------------------------------------------------------
-- Column / table privileges (the coarse first gate, before RLS)
-- ---------------------------------------------------------
revoke all on public.sponsorship_deliverables from authenticated, anon;
revoke all on public.sponsorship_deliverable_progress from authenticated, anon;

grant select on public.sponsorship_deliverables, public.sponsorship_deliverable_progress to authenticated;
grant insert (sponsorship_id, title, status, assigned_to, due_date, notes) on public.sponsorship_deliverables to authenticated;
grant update (title, status, assigned_to, due_date, notes) on public.sponsorship_deliverables to authenticated;
grant delete on public.sponsorship_deliverables to authenticated;
-- completed_at / completed_by / template_id / source / sort_order / created_*: trigger-derived, never grantable.

-- ---------------------------------------------------------
-- Notification catalog (0029): a new email category and the type mapped to it.
-- Same default as every other category (on); each person can turn it off under
-- Account > Email Notifications, and a person with it off gets the in-app
-- notification but no email.
-- ---------------------------------------------------------
insert into public.notification_categories (key, label, description, sort_order) values
  ('sponsorship_deliverables', 'Sponsorship deliverables', 'Receive an email when a sponsorship deliverable is assigned to you.', 100)
on conflict (key) do nothing;

insert into public.notification_type_categories (notification_type, category_key) values
  ('sponsorship_deliverable_assigned', 'sponsorship_deliverables')
on conflict (notification_type) do nothing;

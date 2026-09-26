-- =========================================================
-- 0036_sponsorship_renewals.sql
-- Phase C3: automatic renewal reminders for Committed sponsorships. Builds on
-- 0033 (Business access), 0034 (Sponsorships: sponsorships.renewal_date already
-- exists and is already editable by managers only), 0035 (deliverables) and 0029
-- (notifications -> per-user email preferences -> email_outbox -> the existing
-- email worker). Reuses their patterns; nothing here duplicates the season or
-- notification systems.
--
-- Changes NO existing table, policy, grant or function, with two purely additive
-- exceptions (same style as 0035):
--   * sponsorship_history.kind also accepts 'renewal' (the log records renewal
--     date changes and reminders). The client insert policy still only accepts 'note'.
--   * two rows in the 0029 notification catalogs (a new email category and the
--     notification type mapped to it).
--
-- When a reminder applies (ALL of these)
--   * the sponsorship is Committed (prospect / contacted / interested /
--     declined / withdrawn never get one),
--   * it has a renewal_date,
--   * it has not already been renewed: the same sponsor has a Committed
--     sponsorship in a LATER season (derived; no new stage and no second season
--     system),
--   * the renewal date is today or later and at most 60 days away (a date that
--     has passed is shown as "overdue" but is never reminded retroactively),
--   * someone would actually receive it (see recipients).
--
-- Thresholds: 60, 30 and 7 days before the renewal date, each at most once per
-- renewal date. TIGHTEST-THRESHOLD RULE: every run considers only the tightest
-- threshold already crossed (20 days out -> the 30-day reminder only; 5 days
-- out -> the 7-day reminder only). Earlier thresholds are never sent
-- retroactively, and a run on a later day does nothing until the next threshold
-- is crossed.
--
-- Idempotency: sponsorship_renewal_reminders is keyed by (sponsorship, renewal
-- date, threshold). The scan inserts that marker FIRST and creates notifications
-- only for markers it actually inserted (INSERT .. ON CONFLICT DO NOTHING), in
-- one statement, so a second run, a retry, or two workers at once cannot repeat
-- a reminder. Changing the renewal date is a different key, so the new date
-- starts a completely new 60/30/7 cycle by construction (old markers are kept as
-- history). Emails: the reminder only creates an in-app notification; the 0029
-- trigger on notifications queues an email if (and only if) the recipient's
-- preference for the new category is on. Postgres never talks to a mail provider.
--
-- Recipients: the sponsorship's responsible person and every Sponsorship Lead,
-- each once (a person who is both gets ONE notification). The Business Lead is
-- not a recipient unless they are also the responsible person or a Sponsorship
-- Lead. Recipients must be active, approved Business members. If a sponsorship
-- has no recipient at all, NOTHING is recorded, so the reminder is still sent
-- once someone is assigned.
--
-- Nothing here schedules anything: the existing email worker
-- (app/api/cron/email) calls enqueue_sponsorship_renewal_reminders() on every
-- run, exactly as it already calls enqueue_due_soon_notifications().
-- =========================================================

-- ---------------------------------------------------------
-- History log: allow renewal events (additive)
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
  check (kind in ('note', 'stage_change', 'level_decision', 'contribution', 'payment', 'availability', 'deliverable', 'renewal'));

-- ---------------------------------------------------------
-- The reminder ledger: one row = one reminder that was sent for one renewal date
-- ---------------------------------------------------------
create table public.sponsorship_renewal_reminders (
  sponsorship_id uuid not null references public.sponsorships(id) on delete restrict,
  renewal_date date not null,
  threshold_days integer not null check (threshold_days in (60, 30, 7)),
  days_remaining integer not null check (days_remaining between 0 and 60),
  created_at timestamptz not null default now(),
  constraint sponsorship_renewal_reminders_pkey primary key (sponsorship_id, renewal_date, threshold_days)
);

-- ---------------------------------------------------------
-- Rules as small, reusable functions
-- ---------------------------------------------------------
-- "Already renewed": the same sponsor has a Committed sponsorship in a later season.
-- SECURITY INVOKER on purpose: it applies the caller's own row-level security, so it reveals
-- nothing a caller could not already read (the worker runs as the owner and sees everything).
create or replace function public.sponsorship_is_renewed(p_sponsorship_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
      from public.sponsorships s
      join public.sponsorships later on later.sponsor_id = s.sponsor_id and later.stage = 'committed' and later.season > s.season
     where s.id = p_sponsorship_id
       and s.season ~ '^[0-9]{4}-[0-9]{4}$'
       and later.season ~ '^[0-9]{4}-[0-9]{4}$'
  );
$$;

-- Who gets a reminder for this sponsorship: the responsible person + the Sponsorship Lead(s), each once,
-- active approved Business members only. Owner-only (the worker and the count function below).
create or replace function public.sponsorship_renewal_recipients(p_sponsorship_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
    from public.sponsorships s
    join public.business_members bm on bm.user_id = s.responsible_user_id
    join public.profiles p on p.id = bm.user_id
   where s.id = p_sponsorship_id and p.active = true and p.approved = true
  union
  select p.id
    from public.business_responsibilities br
    join public.business_members bm on bm.user_id = br.user_id
    join public.profiles p on p.id = br.user_id
   where br.responsibility = 'sponsorship_lead' and p.active = true and p.approved = true;
$$;

-- How many people would receive it (for the UI's "is anyone going to be told?"). Viewers only; a bare number.
create or replace function public.sponsorship_renewal_recipient_count(p_sponsorship_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when public.can_view_business() then (select count(*)::integer from public.sponsorship_renewal_recipients(p_sponsorship_id)) end;
$$;

revoke execute on function public.sponsorship_is_renewed(uuid) from public;
revoke execute on function public.sponsorship_is_renewed(uuid) from anon, authenticated;
grant execute on function public.sponsorship_is_renewed(uuid) to authenticated, service_role;
revoke execute on function public.sponsorship_renewal_recipients(uuid) from public;
revoke execute on function public.sponsorship_renewal_recipients(uuid) from anon, authenticated;
revoke execute on function public.sponsorship_renewal_recipient_count(uuid) from public;
revoke execute on function public.sponsorship_renewal_recipient_count(uuid) from anon, authenticated;
grant execute on function public.sponsorship_renewal_recipient_count(uuid) to authenticated;

-- ---------------------------------------------------------
-- The scan (service role only; called by the existing email worker)
-- ---------------------------------------------------------
create or replace function public.enqueue_sponsorship_renewal_reminders(p_today date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  -- "today" is the team's local date, like the task due-soon scan in 0029
  v_today date := coalesce(p_today, (now() at time zone 'America/New_York')::date);
  v_count integer;
begin
  with due as (
    select s.id as sponsorship_id,
           s.renewal_date,
           (s.renewal_date - v_today) as days_left,
           -- the tightest threshold already crossed: 20 days out -> 30, 5 days out -> 7
           (select min(t) from unnest(array[7, 30, 60]) as t where (s.renewal_date - v_today) <= t) as threshold,
           sp.name as sponsor_name,
           lv.name as level_name,
           coalesce(pr.display_name, pr.email) as responsible_name
      from public.sponsorships s
      join public.sponsors sp on sp.id = s.sponsor_id
      left join public.sponsorship_levels lv on lv.id = s.level_id
      left join public.profiles pr on pr.id = s.responsible_user_id
     where s.stage = 'committed'
       and s.renewal_date is not null
       and s.renewal_date >= v_today
       and (s.renewal_date - v_today) <= 60
       and not public.sponsorship_is_renewed(s.id)
       and exists (select 1 from public.sponsorship_renewal_recipients(s.id))
  ),
  fresh as (
    insert into public.sponsorship_renewal_reminders (sponsorship_id, renewal_date, threshold_days, days_remaining)
    select sponsorship_id, renewal_date, threshold, days_left from due
    on conflict do nothing
    returning sponsorship_id, renewal_date, threshold_days, days_remaining
  ),
  logged as (
    insert into public.sponsorship_history (sponsorship_id, kind, body, details, created_by)
    select f.sponsorship_id, 'renewal',
           'Renewal reminder sent (' || f.threshold_days || ' days before ' || to_char(f.renewal_date, 'Mon FMDD, YYYY') || ')',
           jsonb_build_object('event', 'reminder', 'threshold_days', f.threshold_days, 'renewal_date', f.renewal_date, 'days_remaining', f.days_remaining),
           null
      from fresh f
    returning 1
  ),
  made as (
    insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
    select r.user_id,
           'sponsorship_renewal',
           'Sponsorship renewal coming up',
           d.sponsor_name || coalesce(' — ' || d.level_name, '') || E'\n' ||
             'Renewal: ' || to_char(f.renewal_date, 'FMMonth FMDD, YYYY') || ' · ' ||
             case f.days_remaining when 0 then 'renews today' when 1 then '1 day remaining' else f.days_remaining || ' days remaining' end || E'\n' ||
             'Responsible: ' || coalesce(d.responsible_name, 'not assigned'),
           'sponsorship',
           f.sponsorship_id
      from fresh f
      join due d on d.sponsorship_id = f.sponsorship_id
      cross join lateral public.sponsorship_renewal_recipients(f.sponsorship_id) as r(user_id)
    returning 1
  )
  select count(*) into v_count from made;

  return v_count;
end;
$$;

revoke execute on function public.enqueue_sponsorship_renewal_reminders(date) from public;
revoke execute on function public.enqueue_sponsorship_renewal_reminders(date) from anon, authenticated;
grant execute on function public.enqueue_sponsorship_renewal_reminders(date) to service_role;

-- ---------------------------------------------------------
-- History: a change of the renewal date is recorded (who / when / from / to)
-- ---------------------------------------------------------
create or replace function public.sponsorships_log_renewal_date()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sponsorship_history (sponsorship_id, kind, body, details, created_by)
  values (new.id, 'renewal',
          case when new.renewal_date is null then 'Renewal date cleared (was ' || to_char(old.renewal_date, 'Mon FMDD, YYYY') || ')'
               when old.renewal_date is null then 'Renewal date set to ' || to_char(new.renewal_date, 'Mon FMDD, YYYY')
               else 'Renewal date changed from ' || to_char(old.renewal_date, 'Mon FMDD, YYYY') || ' to ' || to_char(new.renewal_date, 'Mon FMDD, YYYY') end,
          jsonb_build_object('event', 'renewal_date', 'from', old.renewal_date, 'to', new.renewal_date),
          auth.uid());
  return new;
end;
$$;

revoke execute on function public.sponsorships_log_renewal_date() from public;
revoke execute on function public.sponsorships_log_renewal_date() from anon, authenticated;

create trigger sponsorships_log_renewal_date after update of renewal_date on public.sponsorships
  for each row
  when (old.renewal_date is distinct from new.renewal_date)
  execute function public.sponsorships_log_renewal_date();

-- ---------------------------------------------------------
-- Derived status (nothing stored twice; no new pipeline stage). security_invoker:
-- the caller's own row-level security applies.
--   not_applicable  not Committed: reminders do not apply
--   no_date         Committed, no renewal date
--   renewed         a later season is already Committed
--   overdue         the renewal date has passed
--   approaching     within 60 days (the first reminder threshold)
--   scheduled       further out than that
-- ---------------------------------------------------------
create view public.sponsorship_renewal_status with (security_invoker = true) as
select
  s.id as sponsorship_id,
  s.sponsor_id,
  s.season,
  s.stage,
  s.renewal_date,
  case when s.renewal_date is null then null else s.renewal_date - t.today end as days_remaining,
  r.renewed,
  case
    when s.stage <> 'committed' then 'not_applicable'
    when s.renewal_date is null then 'no_date'
    when r.renewed then 'renewed'
    when s.renewal_date < t.today then 'overdue'
    when s.renewal_date - t.today <= 60 then 'approaching'
    else 'scheduled'
  end as renewal_state,
  public.sponsorship_renewal_recipient_count(s.id) as reminder_recipients
from public.sponsorships s
cross join (select (now() at time zone 'America/New_York')::date as today) t
cross join lateral (select public.sponsorship_is_renewed(s.id) as renewed) r;

-- ---------------------------------------------------------
-- Row Level Security / privileges: readable by whoever can view Business; NO client write path at all
-- (the ledger is written only by the scan; the renewal DATE itself is edited through the existing
-- manager-only update policy on sponsorships).
-- ---------------------------------------------------------
alter table public.sponsorship_renewal_reminders enable row level security;
create policy sponsorship_renewal_reminders_select on public.sponsorship_renewal_reminders
  for select to authenticated using (public.can_view_business());

revoke all on public.sponsorship_renewal_reminders from authenticated, anon;
revoke all on public.sponsorship_renewal_status from authenticated, anon;
grant select on public.sponsorship_renewal_reminders, public.sponsorship_renewal_status to authenticated;

-- ---------------------------------------------------------
-- Notification catalog (0029): a new email category and the type mapped to it. On by default like every
-- other category; each person can turn it off under Account > Email Notifications, and someone with it off
-- still gets the in-app notification but no email.
-- ---------------------------------------------------------
insert into public.notification_categories (key, label, description, sort_order) values
  ('sponsorship_renewals', 'Sponsorship renewal reminders', 'Receive an email 60, 30 and 7 days before a sponsorship you are responsible for (or, as Sponsorship Lead, any sponsorship) is due for renewal.', 110)
on conflict (key) do nothing;

insert into public.notification_type_categories (notification_type, category_key) values
  ('sponsorship_renewal', 'sponsorship_renewals')
on conflict (notification_type) do nothing;

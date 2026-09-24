-- =========================================================
-- 0029_email_notification_preferences.sql
-- Per-user EMAIL preferences for every notification category, an
-- asynchronous email queue, and the two notification types that did not
-- exist yet (task due soon, task deadline changed). Builds on 0001-0028
-- and reuses their patterns (SECURITY DEFINER helpers with the full
-- EXECUTE revoke, additive triggers, no client insert path).
--
-- What this does NOT change: the in-app notification system. Every
-- existing trigger from 0016/0020 is untouched and still creates the same
-- notification rows. An email preference can only ever decide whether an
-- EMAIL is queued for a notification that was created anyway.
--
-- ---------------------------------------------------------
-- How it fits together
--   1. Something creates a row in public.notifications (unchanged).
--   2. An AFTER INSERT trigger on notifications looks up the notification's
--      category and the recipient's preference. If email is enabled, it
--      inserts ONE row into public.email_outbox (a plain local insert —
--      Postgres never talks to an email provider). The insert is wrapped in
--      its own sub-transaction, so even a failure here cannot roll back or
--      break the transaction that created the notification.
--   3. A server-side worker (app/api/cron/email) claims pending outbox rows,
--      sends them through the configured provider, and marks them sent or
--      schedules a retry. It also runs the due-soon scan.
--
-- Categories and defaults
--   notification_categories is the single catalog (stable keys, labels,
--   descriptions, default). notification_type_categories maps each concrete
--   notifications.type to a category. Adding a future category or type is
--   two INSERTs into these catalogs — no code, no restructuring. A user
--   with no stored row for a category gets the catalog default (ON), which
--   is how existing users get sensible defaults with no backfill and how
--   users created later — or categories added later — are covered
--   automatically.
--
-- Idempotency
--   * email_outbox.notification_id is UNIQUE: one email per notification no
--     matter how many times enqueueing runs.
--   * Claiming uses FOR UPDATE SKIP LOCKED and moves a row to 'sending'
--     exactly once; completing only transitions 'sending' -> 'sent', so a
--     repeated completion is a no-op. A crashed worker's stale 'sending'
--     row is retried, never duplicated by the queue itself.
--   * task_due_soon_notified records (task, user, deadline date): the
--     due-soon scan inserts the marker first and only creates the
--     notification when that insert actually happened, so re-running the
--     scan never repeats it. Changing a task's deadline clears its markers
--     so the new deadline gets its own cycle.
-- =========================================================

-- ---------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------
create table public.notification_categories (
  key text primary key,
  label text not null,
  description text not null,
  default_enabled boolean not null default true,
  sort_order integer not null,
  created_at timestamptz not null default now()
);

create table public.notification_type_categories (
  notification_type text primary key,
  category_key text not null references public.notification_categories(key) on delete cascade
);

insert into public.notification_categories (key, label, description, sort_order) values
  ('task_assignments',    'Task assignments',        'Receive an email when a task is assigned to you.', 10),
  ('co_owner_assignments','Co-owner assignments',    'Receive an email when you are added as a co-owner of a task.', 20),
  ('task_request_updates','Task request updates',    'Receive emails when a task request you submitted is reviewed.', 30),
  ('purchase_updates',    'Purchase updates',        'Receive emails about purchasing request status changes.', 40),
  ('cad_review_updates',  'CAD review updates',      'Receive emails about CAD review status changes.', 50),
  ('comments_mentions',   'Comments & mentions',     'Receive emails when you are mentioned in a comment.', 60),
  ('tasks_due_soon',      'Tasks due soon',          'Receive an email when one of your tasks is approaching its deadline.', 70),
  ('deadline_changes',    'Deadline changes',        'Receive an email when one of your task deadlines changes.', 80),
  ('account_updates',     'Membership application updates', 'Receive emails when your membership application is reviewed.', 90);

insert into public.notification_type_categories (notification_type, category_key) values
  ('task_assignment',       'task_assignments'),
  ('co_owner_assignment',   'co_owner_assignments'),
  ('task_request_reviewed', 'task_request_updates'),
  ('purchase_status',       'purchase_updates'),
  ('cad_review',            'cad_review_updates'),
  ('comment_mention',       'comments_mentions'),
  ('task_due_soon',         'tasks_due_soon'),
  ('task_deadline_changed', 'deadline_changes'),
  ('account_approval',      'account_updates'),
  ('account_rejection',     'account_updates');

alter table public.notification_categories enable row level security;
alter table public.notification_type_categories enable row level security;

create policy notification_categories_select on public.notification_categories
  for select to authenticated using (true);
create policy notification_type_categories_select on public.notification_type_categories
  for select to authenticated using (true);

revoke all on public.notification_categories from authenticated, anon;
revoke all on public.notification_type_categories from authenticated, anon;
grant select on public.notification_categories to authenticated;
grant select on public.notification_type_categories to authenticated;
-- No write grant to anyone via the API: the catalog changes by migration only.

-- ---------------------------------------------------------
-- Per-user preferences: one row per (user, category). Strictly personal —
-- like notifications themselves there is deliberately NO cto/admin/coo
-- override: nobody can read or change another user's email preferences.
-- ---------------------------------------------------------
create table public.email_notification_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  category_key text not null references public.notification_categories(key) on delete cascade,
  enabled boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, category_key)
);

create trigger email_notification_preferences_set_updated_at
  before update on public.email_notification_preferences
  for each row execute function public.set_updated_at();

alter table public.email_notification_preferences enable row level security;

create policy email_prefs_select_own on public.email_notification_preferences
  for select to authenticated using (user_id = auth.uid());
create policy email_prefs_insert_own on public.email_notification_preferences
  for insert to authenticated with check (user_id = auth.uid());
create policy email_prefs_update_own on public.email_notification_preferences
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.email_notification_preferences from authenticated, anon;
grant select on public.email_notification_preferences to authenticated;
grant insert (user_id, category_key, enabled) on public.email_notification_preferences to authenticated;
grant update (enabled) on public.email_notification_preferences to authenticated;
-- No delete grant. user_id/category_key are the key and are never updatable.

-- The app's only write path. SECURITY INVOKER: it runs under the caller's own
-- grants and RLS, so it can only ever touch the caller's own rows. (A plain
-- PostgREST upsert would also try to rewrite the key columns, which are
-- deliberately not grantable for update.)
create or replace function public.set_email_preference(p_category text, p_enabled boolean)
returns void
language plpgsql
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'A preference must be on or off' using errcode = '22023';
  end if;
  if not exists (select 1 from public.notification_categories where key = p_category) then
    raise exception 'Unknown notification category' using errcode = '22023';
  end if;

  insert into public.email_notification_preferences (user_id, category_key, enabled)
  values (auth.uid(), p_category, p_enabled)
  on conflict (user_id, category_key) do update set enabled = excluded.enabled;
end;
$$;

revoke execute on function public.set_email_preference(text, boolean) from public;
revoke execute on function public.set_email_preference(text, boolean) from anon, authenticated;
grant execute on function public.set_email_preference(text, boolean) to authenticated;

-- Effective preference for a user and a concrete notification type: the
-- stored choice if there is one, otherwise the category default. An unmapped
-- type never emails. Server-side only (used by the queue), never exposed.
create or replace function public.email_enabled_for(p_user_id uuid, p_notification_type text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.enabled
       from public.email_notification_preferences p
       join public.notification_type_categories tc on tc.category_key = p.category_key
      where p.user_id = p_user_id and tc.notification_type = p_notification_type),
    (select c.default_enabled
       from public.notification_categories c
       join public.notification_type_categories tc on tc.category_key = c.key
      where tc.notification_type = p_notification_type),
    false
  );
$$;

revoke execute on function public.email_enabled_for(uuid, text) from public;
revoke execute on function public.email_enabled_for(uuid, text) from anon, authenticated;
grant execute on function public.email_enabled_for(uuid, text) to service_role;

-- ---------------------------------------------------------
-- Email queue. Server-side only: RLS on, no policy, no grant to
-- anon/authenticated. The worker uses the service role.
-- ---------------------------------------------------------
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  category_key text not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text,
  skip_reason text,
  created_at timestamptz not null default now(),
  constraint email_outbox_notification_key unique (notification_id)
);

create index email_outbox_due_idx on public.email_outbox (next_attempt_at) where status = 'pending';
create index email_outbox_user_idx on public.email_outbox (user_id);

alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from authenticated, anon;

-- ---------------------------------------------------------
-- Enqueue: one AFTER INSERT trigger on notifications covers EVERY category,
-- present and future, without touching any of the triggers that create
-- notifications. Email OFF (or an unmapped type, or a recipient who cannot
-- receive email) simply queues nothing — the notification itself is already
-- inserted and is never affected.
-- ---------------------------------------------------------
create or replace function public.enqueue_notification_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category text;
begin
  select category_key into v_category
    from public.notification_type_categories
   where notification_type = new.type;
  if v_category is null then
    return new;
  end if;

  if not public.email_enabled_for(new.user_id, new.type) then
    return new;
  end if;

  if not exists (
    select 1 from public.profiles
     where id = new.user_id and active = true and approved = true and coalesce(email, '') <> ''
  ) then
    return new;
  end if;

  -- Own sub-transaction: whatever happens here can never abort the statement
  -- that created the notification.
  begin
    insert into public.email_outbox (notification_id, user_id, category_key)
    values (new.id, new.user_id, v_category)
    on conflict (notification_id) do nothing;
  exception when others then
    raise warning 'email enqueue failed for notification %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

revoke execute on function public.enqueue_notification_email() from public;
revoke execute on function public.enqueue_notification_email() from anon, authenticated;

create trigger notifications_enqueue_email
  after insert on public.notifications
  for each row execute function public.enqueue_notification_email();

-- ---------------------------------------------------------
-- Worker RPCs (service role only)
-- ---------------------------------------------------------
create or replace function public.claim_email_batch(p_limit integer default 25, p_max_attempts integer default 5)
returns table (
  outbox_id uuid,
  attempt integer,
  to_email text,
  recipient_name text,
  notification_type text,
  title text,
  message text,
  entity_type text,
  entity_id uuid,
  category_key text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  -- A worker that died mid-send leaves a stale 'sending' row: retry it, or
  -- give up once it has used all its attempts.
  update public.email_outbox
     set status = case when attempts >= p_max_attempts then 'failed' else 'pending' end,
         locked_at = null,
         last_error = coalesce(last_error, 'worker did not finish (stale lock)')
   where status = 'sending' and locked_at < now() - interval '10 minutes';

  -- Preferences are honoured at send time too: turning a category off after
  -- an email was queued cancels it.
  update public.email_outbox o
     set status = 'skipped', skip_reason = 'preference_off'
    from public.notifications n
   where o.status = 'pending'
     and n.id = o.notification_id
     and not public.email_enabled_for(o.user_id, n.type);

  update public.email_outbox o
     set status = 'skipped', skip_reason = 'recipient_unavailable'
   where o.status = 'pending'
     and not exists (
       select 1 from public.profiles p
        where p.id = o.user_id and p.active = true and p.approved = true and coalesce(p.email, '') <> ''
     );

  return query
  with picked as (
    select o.id
      from public.email_outbox o
     where o.status = 'pending' and o.next_attempt_at <= now()
     order by o.created_at
     limit greatest(p_limit, 0)
     for update skip locked
  )
  update public.email_outbox o
     set status = 'sending', locked_at = now(), attempts = o.attempts + 1
    from picked, public.notifications n, public.profiles p
   where o.id = picked.id and n.id = o.notification_id and p.id = o.user_id
  returning o.id, o.attempts, p.email, p.display_name, n.type, n.title, n.message, n.entity_type, n.entity_id, o.category_key;
end;
$$;

-- Only a row that is currently 'sending' can complete, so a repeated or
-- late completion is a harmless no-op that reports false.
create or replace function public.complete_email(p_outbox_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  update public.email_outbox
     set status = 'sent', sent_at = now(), locked_at = null, last_error = null
   where id = p_outbox_id and status = 'sending';
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- Retry with exponential backoff (2, 4, 8, ... minutes) until p_max_attempts.
create or replace function public.fail_email(p_outbox_id uuid, p_error text, p_max_attempts integer default 5)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  update public.email_outbox
     set status = case when attempts >= p_max_attempts then 'failed' else 'pending' end,
         next_attempt_at = now() + (interval '1 minute' * power(2, attempts)),
         locked_at = null,
         last_error = left(coalesce(p_error, 'unknown error'), 500)
   where id = p_outbox_id and status = 'sending'
  returning status into v_status;
  return v_status;
end;
$$;

revoke execute on function public.claim_email_batch(integer, integer) from public;
revoke execute on function public.claim_email_batch(integer, integer) from anon, authenticated;
grant execute on function public.claim_email_batch(integer, integer) to service_role;
revoke execute on function public.complete_email(uuid) from public;
revoke execute on function public.complete_email(uuid) from anon, authenticated;
grant execute on function public.complete_email(uuid) to service_role;
revoke execute on function public.fail_email(uuid, text, integer) from public;
revoke execute on function public.fail_email(uuid, text, integer) from anon, authenticated;
grant execute on function public.fail_email(uuid, text, integer) to service_role;

-- ---------------------------------------------------------
-- New notification type: task deadline changed
-- Notifies the task's assignees (primary owner and co-owners) when the
-- deadline actually changes. Fires only when the deadline value differs
-- (an unchanged deadline, or an edit to any other field, never does), skips
-- the person who made the change (same convention as every trigger in
-- 0016), and clears the task's due-soon markers so the new deadline starts
-- a fresh due-soon cycle.
-- ---------------------------------------------------------
create table public.task_due_soon_notified (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  deadline_date date not null,
  notified_at timestamptz not null default now(),
  primary key (task_id, user_id, deadline_date)
);

alter table public.task_due_soon_notified enable row level security;
revoke all on public.task_due_soon_notified from authenticated, anon;

create or replace function public.notify_task_deadline_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text := coalesce(to_char(old.deadline at time zone 'UTC', 'Mon FMDD, YYYY'), 'no deadline');
  v_new text := coalesce(to_char(new.deadline at time zone 'UTC', 'Mon FMDD, YYYY'), 'no deadline');
begin
  if old.deadline is not distinct from new.deadline then
    return new;
  end if;

  delete from public.task_due_soon_notified where task_id = new.id;

  insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
  select ta.user_id,
         'task_deadline_changed',
         'A task deadline changed',
         new.title || ': deadline changed from ' || v_old || ' to ' || v_new,
         'task',
         new.id
    from public.task_assignees ta
    join public.profiles p on p.id = ta.user_id
   where ta.task_id = new.id
     and ta.user_id is distinct from auth.uid()
     and p.active = true and p.approved = true;

  return new;
end;
$$;

revoke execute on function public.notify_task_deadline_changed() from public;
revoke execute on function public.notify_task_deadline_changed() from anon, authenticated;

create trigger tasks_notify_deadline_changed
  after update of deadline on public.tasks
  for each row
  when (old.deadline is distinct from new.deadline)
  execute function public.notify_task_deadline_changed();

-- ---------------------------------------------------------
-- New notification type: task due soon
-- Same definition as the app's existing "due soon" (lib/deadline.ts): from
-- today through 7 days from today, inclusive, by calendar date (deadlines
-- are date-only, stored as midnight UTC). "Today" is the team's local date
-- (America/New_York). Only OPEN tasks with a deadline, and only for the
-- people assigned to them. Idempotent: the marker row is inserted first and
-- the notification is created only for markers that were actually inserted,
-- so running this any number of times notifies once per (task, person,
-- deadline).
-- ---------------------------------------------------------
create or replace function public.enqueue_due_soon_notifications(p_today date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := coalesce(p_today, (now() at time zone 'America/New_York')::date);
  v_count integer;
begin
  with due as (
    select t.id as task_id, t.title, (t.deadline at time zone 'UTC')::date as deadline_date, ta.user_id
      from public.tasks t
      join public.task_assignees ta on ta.task_id = t.id
      join public.profiles p on p.id = ta.user_id
     where t.deadline is not null
       and t.status <> 'Complete'
       and (t.deadline at time zone 'UTC')::date between v_today and v_today + 7
       and p.active = true and p.approved = true
  ),
  fresh as (
    insert into public.task_due_soon_notified (task_id, user_id, deadline_date)
    select task_id, user_id, deadline_date from due
    on conflict do nothing
    returning task_id, user_id, deadline_date
  ),
  made as (
    insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
    select f.user_id,
           'task_due_soon',
           'A task is due soon',
           d.title || ' is due ' || to_char(f.deadline_date, 'Mon FMDD, YYYY'),
           'task',
           f.task_id
      from fresh f
      join due d on d.task_id = f.task_id and d.user_id = f.user_id
    returning 1
  )
  select count(*) into v_count from made;

  return v_count;
end;
$$;

revoke execute on function public.enqueue_due_soon_notifications(date) from public;
revoke execute on function public.enqueue_due_soon_notifications(date) from anon, authenticated;
grant execute on function public.enqueue_due_soon_notifications(date) to service_role;

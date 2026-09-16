-- =========================================================
-- 0011_notifications_audit_migration_infrastructure.sql
-- Phase 6.2F: notifications, an administrative audit log, and
-- the future production-migration bookkeeping tables
-- (migration_log, migration_exceptions). Builds on 0001-0010
-- and reuses their security patterns exactly. No new SECURITY
-- DEFINER helper functions are needed this phase — every check
-- here is satisfied by the existing is_cto_or_admin() from
-- 0002/0003, and the one new trigger (on migration_exceptions)
-- only modifies its own row, so it doesn't need elevated
-- privilege. Does NOT touch workspace_state or any legacy
-- table, and does not migrate any production data — this
-- migration only creates the storage and locks it down; the
-- actual future migration script (run with service-role access,
-- bypassing RLS/grants entirely, same as any privileged import)
-- is out of scope here. Run against bobcat-dev only.
--
-- Design notes:
--   - notifications.type / audit_logs.action / migration_log.
--     match_method are plain text, not enums — the notification
--     type list in the brief ("task assignment, co-owner
--     assignment, deadlines, overdue tasks, blocked tasks,
--     review requests, CAD review, purchase status, comments/
--     mentions, subsystem announcements, account approval/
--     rejection") is explicitly described as something future
--     phases will extend; an enum would need a migration every
--     time a new type is added, which defeats that intent.
--   - No table in this migration grants INSERT to `authenticated`
--     at all. Notifications, audit log entries, and migration
--     bookkeeping rows are all populated by privileged
--     mechanisms not built in this phase (future triggers on
--     other tables' events, or the migration script's own
--     service-role access) — never by a client's own API call.
--     This is what makes "users cannot create fake
--     notifications" and "audit/migration logs cannot be
--     forged" true by construction, not just by policy.
--   - notifications.user_id has ON DELETE CASCADE (a personal
--     inbox has no reason to survive its owner). audit_logs.
--     user_id has ON DELETE SET NULL (the historical record
--     should outlive the actor, unlike created_by-style
--     attribution elsewhere in this schema).
-- =========================================================

-- ---------------------------------------------------------
-- notifications
-- A strictly personal inbox: "Users must never be able to
-- access another user's notifications" is read literally, with
-- no cto/admin override — unlike every other table in this
-- schema, there is no elevated-role bypass here at all.
-- ---------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  message text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_id_idx on public.notifications (user_id);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_entity_idx on public.notifications (entity_type, entity_id);

alter table public.notifications enable row level security;

create policy notifications_select
  on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid());

create policy notifications_update_own
  on public.notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.notifications from authenticated, anon;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
-- No insert grant to anyone: notification creation is deferred
-- to a future privileged mechanism (see header note). No delete
-- grant: not requested, and there is no "dismiss" concept here
-- yet — mark-read via read_at is the only described mutation.

-- ---------------------------------------------------------
-- audit_logs
-- Administrative/history log, not primary application data.
-- No insert/update/delete grant to anyone via the API at all —
-- population is deferred to a future privileged mechanism, the
-- same reasoning as purchase_status_history's zero-grant,
-- trigger-only design, except here even the trigger side isn't
-- built yet (that would mean touching every existing table).
-- Read access is cto/admin only; this is an ops tool, not a
-- personal activity feed.
-- ---------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_user_id_idx on public.audit_logs (user_id);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at);

alter table public.audit_logs enable row level security;

create policy audit_logs_select
  on public.audit_logs
  for select
  to authenticated
  using (public.is_cto_or_admin());

revoke all on public.audit_logs from authenticated, anon;
grant select on public.audit_logs to authenticated;
-- No insert/update/delete grant to anyone, including cto/admin —
-- this table's integrity depends on nothing but a privileged,
-- out-of-band process ever being able to write to it.

-- ---------------------------------------------------------
-- migration_log
-- Append-only record of what the future production migration
-- did with each legacy record. unique(entity_type,
-- legacy_id_or_key) lets that future script check "have I
-- already processed this legacy row?" — the idempotency
-- mechanism the brief asks for. Populated exclusively by that
-- script's own service-role access; no grant to authenticated.
-- ---------------------------------------------------------
create type public.migration_log_status as enum ('migrated', 'exception', 'skipped');

create table public.migration_log (
  id uuid primary key default gen_random_uuid(),
  migration_batch_id uuid not null,
  entity_type text not null,
  legacy_id_or_key text not null,
  new_id uuid,
  match_method text,
  status public.migration_log_status not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint migration_log_entity_legacy_key unique (entity_type, legacy_id_or_key)
);

create index migration_log_batch_id_idx on public.migration_log (migration_batch_id);
create index migration_log_entity_type_idx on public.migration_log (entity_type);
create index migration_log_status_idx on public.migration_log (status);

alter table public.migration_log enable row level security;

create policy migration_log_select
  on public.migration_log
  for select
  to authenticated
  using (public.is_cto_or_admin());

revoke all on public.migration_log from authenticated, anon;
grant select on public.migration_log to authenticated;
-- No insert/update/delete grant to anyone via the API.

-- ---------------------------------------------------------
-- migration_exceptions
-- Unlike migration_log, this is an actionable admin worklist:
-- cto/admin can resolve an exception by linking it to a real
-- profile. resolved_by/resolved_at are trigger-derived, stamped
-- once when resolution_status first leaves 'unresolved', and
-- cleared if it's reopened back to 'unresolved' — same pattern
-- as reviewed_by/reviewed_at elsewhere in this schema. New
-- exception rows are still only ever created by the future
-- migration script's own service-role access, never via the API.
-- ---------------------------------------------------------
create type public.migration_exception_resolution_status as enum ('unresolved', 'resolved', 'ignored');

create table public.migration_exceptions (
  id uuid primary key default gen_random_uuid(),
  migration_batch_id uuid not null,
  entity_type text not null,
  raw_value text,
  context jsonb,
  resolution_status public.migration_exception_resolution_status not null default 'unresolved',
  resolved_to_profile_id uuid references public.profiles(id) on delete set null,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index migration_exceptions_batch_id_idx on public.migration_exceptions (migration_batch_id);
create index migration_exceptions_entity_type_idx on public.migration_exceptions (entity_type);
create index migration_exceptions_resolution_status_idx on public.migration_exceptions (resolution_status);

create or replace function public.migration_exceptions_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.resolution_status in ('resolved', 'ignored') and old.resolution_status = 'unresolved' then
    new.resolved_by := auth.uid();
    new.resolved_at := now();
  elsif new.resolution_status = 'unresolved' then
    new.resolved_by := null;
    new.resolved_at := null;
  else
    new.resolved_by := old.resolved_by;
    new.resolved_at := old.resolved_at;
  end if;
  return new;
end;
$$;

create trigger migration_exceptions_before_update
  before update on public.migration_exceptions
  for each row execute function public.migration_exceptions_before_update();

alter table public.migration_exceptions enable row level security;

create policy migration_exceptions_select
  on public.migration_exceptions
  for select
  to authenticated
  using (public.is_cto_or_admin());

create policy migration_exceptions_update_resolve
  on public.migration_exceptions
  for update
  to authenticated
  using (public.is_cto_or_admin())
  with check (public.is_cto_or_admin());

revoke all on public.migration_exceptions from authenticated, anon;
grant select on public.migration_exceptions to authenticated;
grant update (resolution_status, resolved_to_profile_id) on public.migration_exceptions to authenticated;
-- resolved_by, resolved_at: trigger-derived, never grantable.
-- No insert/delete grant to anyone via the API.

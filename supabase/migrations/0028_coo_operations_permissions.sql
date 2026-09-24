-- =========================================================
-- 0028_coo_operations_permissions.sql
-- The COO role's database permissions. Requires 0026 (the 'coo' enum
-- value) to have been run and committed first. Builds on 0001-0027 and
-- reuses their patterns: SECURITY DEFINER boolean helpers, ADDITIVE
-- permissive policies (OR'd with the existing cto/admin/lead policies,
-- which are untouched), trigger-based field locking, and a
-- transaction-local flag (0024/0027 style) for one narrow privileged
-- write. Does not touch workspace_state, any legacy table, or any row.
--
-- The COO owns OPERATIONS AND SCHEDULING:
--   * calendar_events, recurring_events, milestones — insert + update
--     (any subsystem, or team-wide) — same as cto/admin. There is no
--     delete grant on these tables; "delete" is archive (active=false),
--     which is an update, so it is covered.
--   * timeline_columns — insert + update (labels, highlight, order,
--     archive). timeline_milestones (the W1-15 cells) — insert, update,
--     delete.
--   * tasks — READ every subsystem's tasks (the scheduling overview
--     needs them), and change ONLY the deadline, through
--     reschedule_task(). There is intentionally NO tasks UPDATE policy
--     for the COO: a direct table UPDATE by a COO matches zero rows.
--
-- The COO gets NOTHING else. In particular no policy or helper here
-- touches: profiles/roles/approval/active (admin_set_user_* stay
-- cto/admin only, so a COO cannot assign the COO role or any other),
-- member_applications, subsystem_members, CAD reviews (approval for
-- manufacturing stays cto/admin), purchasing (a COO can read it like
-- every approved user, but has no insert/update/approve path), task
-- comments/attachments, or competition_settings.
--
-- 'admin' and 'cto' keep everything they had: every new policy is
-- additive and every changed trigger widens (never narrows) who is
-- treated as an operations manager.
-- =========================================================

-- ---------------------------------------------------------
-- Helpers. Same shape and hardening as is_cto_or_admin() (0021):
-- boolean only, approved AND active, EXECUTE only for authenticated.
-- ---------------------------------------------------------
create or replace function public.is_coo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and approved = true and active = true and role = 'coo'
  );
$$;

revoke execute on function public.is_coo() from public;
revoke execute on function public.is_coo() from anon, authenticated;
grant execute on function public.is_coo() to authenticated;

-- "May manage the calendar / timeline": cto, admin or coo.
create or replace function public.can_manage_operations()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_cto_or_admin() or public.is_coo();
$$;

revoke execute on function public.can_manage_operations() from public;
revoke execute on function public.can_manage_operations() from anon, authenticated;
grant execute on function public.can_manage_operations() to authenticated;

-- ---------------------------------------------------------
-- Triggers that stopped anyone but cto/admin from moving a row between
-- subsystems (or to/from team-wide). The COO manages the whole team's
-- schedule, so it is allowed the same. Bodies are otherwise identical
-- to 0010.
-- ---------------------------------------------------------
create or replace function public.calendar_events_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    if not public.can_manage_operations() then
      new.subsystem_id := old.subsystem_id;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.lock_subsystem_id_for_non_admin()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and not public.can_manage_operations() then
    new.subsystem_id := old.subsystem_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------
-- Additive COO policies on the operations tables. Column grants are
-- role-level (authenticated) and already cover every column the COO
-- needs; RLS is what scopes who may use them.
-- ---------------------------------------------------------
create policy calendar_events_insert_coo on public.calendar_events
  for insert to authenticated with check (public.is_coo());
create policy calendar_events_update_coo on public.calendar_events
  for update to authenticated using (public.is_coo()) with check (public.is_coo());

create policy recurring_events_insert_coo on public.recurring_events
  for insert to authenticated with check (public.is_coo());
create policy recurring_events_update_coo on public.recurring_events
  for update to authenticated using (public.is_coo()) with check (public.is_coo());

create policy milestones_insert_coo on public.milestones
  for insert to authenticated with check (public.is_coo());
create policy milestones_update_coo on public.milestones
  for update to authenticated using (public.is_coo()) with check (public.is_coo());

create policy timeline_columns_insert_coo on public.timeline_columns
  for insert to authenticated with check (public.is_coo());
create policy timeline_columns_update_coo on public.timeline_columns
  for update to authenticated using (public.is_coo()) with check (public.is_coo());

create policy timeline_milestones_insert_coo on public.timeline_milestones
  for insert to authenticated with check (public.is_coo());
create policy timeline_milestones_update_coo on public.timeline_milestones
  for update to authenticated using (public.is_coo()) with check (public.is_coo());
create policy timeline_milestones_delete_coo on public.timeline_milestones
  for delete to authenticated using (public.is_coo());

-- ---------------------------------------------------------
-- Tasks: read-only visibility for the COO, plus a deadline-only write path.
-- ---------------------------------------------------------
create policy tasks_select_coo on public.tasks
  for select to authenticated using (public.is_coo());

-- tasks_before_write (0004, re-created in 0024) reverts every field except
-- status for a caller who is neither cto/admin nor the subsystem's lead.
-- reschedule_task() is the one sanctioned exception, and only for
-- 'deadline': it sets a transaction-local flag that this function honours
-- for that single column. Everything else in the body is exactly 0024's.
create or replace function public.tasks_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.primary_owner_id := null;
    if new.status = 'Complete' then
      new.completed_at := now();
    else
      new.completed_at := null;
    end if;
  elsif tg_op = 'UPDATE' then
    new.created_by := old.created_by;

    if new.status = 'Complete' and old.status is distinct from 'Complete' then
      new.completed_at := now();
    elsif new.status <> 'Complete' then
      new.completed_at := null;
    else
      new.completed_at := old.completed_at;
    end if;

    if not public.is_cto_or_admin() then
      new.subsystem_id := old.subsystem_id;
      if not public.is_subsystem_lead(old.subsystem_id) then
        new.title := old.title;
        new.description := old.description;
        new.category_id := old.category_id;
        if current_setting('bobcat.sync_primary_owner', true) is distinct from 'true' then
          new.primary_owner_id := old.primary_owner_id;
        end if;
        new.priority := old.priority;
        if current_setting('bobcat.reschedule_task', true) is distinct from 'true' then
          new.deadline := old.deadline;
        end if;
        new.legacy_id := old.legacy_id;
        new.legacy_assignee_raw := old.legacy_assignee_raw;
      end if;
    end if;
  end if;

  if new.category_id is not null and not exists (
    select 1 from public.subsystem_categories c
    where c.id = new.category_id and c.subsystem_id = new.subsystem_id
  ) then
    raise exception 'category % does not belong to subsystem %', new.category_id, new.subsystem_id;
  end if;

  return new;
end;
$$;

-- SECURITY DEFINER because the COO has no UPDATE policy on tasks at all; the
-- function itself is the whole authorization (explicit 42501 otherwise) and
-- writes exactly one column. Deadlines are date-only by convention (stored as
-- midnight UTC, see lib/deadline.ts), so the value is normalized to that.
create or replace function public.reschedule_task(p_task_id uuid, p_deadline timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_coo() or public.is_cto_or_admin()) then
    raise exception 'Only the COO, CTO or an admin can reschedule a task'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.tasks where id = p_task_id) then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  perform set_config('bobcat.reschedule_task', 'true', true);

  update public.tasks
     set deadline = case
       when p_deadline is null then null
       else ((p_deadline at time zone 'UTC')::date)::timestamp at time zone 'UTC'
     end
   where id = p_task_id;

  perform set_config('bobcat.reschedule_task', '', true);
end;
$$;

revoke execute on function public.reschedule_task(uuid, timestamptz) from public;
revoke execute on function public.reschedule_task(uuid, timestamptz) from anon, authenticated;
grant execute on function public.reschedule_task(uuid, timestamptz) to authenticated;

-- =========================================================
-- 0047_general_subsystem.sql
-- A "General" subsystem: the home for team-wide tasks that do not belong to one subsystem (shop cleanup, trailer
-- packing, website updates...). It is just a subsystems row, so tasks, filters, the subsystem page, notifications and
-- the dashboard all work with it unchanged.
--
-- What is different about it: nobody is a "member" of General, so the ordinary subsystem-membership rules would hide
-- its tasks from everyone but cto/admin. This migration makes General's TASKS (only tasks) readable by every approved,
-- active user and lets any of them accept an unowned General task for themselves, exactly the way a member of an
-- ordinary subsystem can (0024). It touches nothing else:
--   * is_subsystem_member() / is_subsystem_lead() are NOT changed, so purchasing, CAD, parts and every other
--     subsystem-scoped feature keep their existing rules and nobody becomes a General "member" by accident
--   * who may CREATE or EDIT a General task is unchanged: cto/admin, or a lead of General (appoint one on the Users
--     page, e.g. the COO, to let them manage General's tasks)
--
-- Changes: one subsystems row, one tiny helper function, one extra tasks SELECT policy, can_access_task() (so comments
-- and attachments follow), the self-accept policy and accept_task() (each with one extra OR clause).
-- =========================================================

insert into public.subsystems (id, name, description)
values ('general', 'General', 'Team-wide tasks that do not belong to one subsystem')
on conflict do nothing;

-- The one place that says which subsystem is team-wide.
create or replace function public.is_team_wide_subsystem(p_subsystem_id text)
returns boolean
language sql
immutable
as $$
  select p_subsystem_id = 'general';
$$;

revoke execute on function public.is_team_wide_subsystem(text) from public;
revoke execute on function public.is_team_wide_subsystem(text) from anon, authenticated;
grant execute on function public.is_team_wide_subsystem(text) to authenticated;

-- Read: any approved user may read a General task (the existing restrictive require_active_user policy still applies).
drop policy if exists tasks_select_general on public.tasks;
create policy tasks_select_general on public.tasks
  for select to authenticated
  using (public.is_team_wide_subsystem(subsystem_id) and public.is_approved());

-- Comments, attachments and assignee rows read through can_access_task(): same body as 0021 plus the General clause.
create or replace function public.can_access_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user() and exists (
    select 1 from public.tasks t
    where t.id = p_task_id
      and (
        public.is_cto_or_admin()
        or public.is_subsystem_lead(t.subsystem_id)
        or (public.is_approved() and public.is_subsystem_member(t.subsystem_id))
        or (public.is_approved() and public.is_team_wide_subsystem(t.subsystem_id))
        or t.primary_owner_id = auth.uid()
        or exists (
          select 1 from public.task_assignees ta
          where ta.task_id = t.id and ta.user_id = auth.uid()
        )
      )
  );
$$;

revoke execute on function public.can_access_task(uuid) from public;
revoke execute on function public.can_access_task(uuid) from anon, authenticated;
grant execute on function public.can_access_task(uuid) to authenticated;

-- Accepting an unowned task: members of an ordinary subsystem (0024), and now anyone for a General task.
drop policy if exists task_assignees_self_accept on public.task_assignees;
create policy task_assignees_self_accept
  on public.task_assignees
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and role = 'primary'
    and public.is_approved()
    and exists (
      select 1 from public.tasks t
      where t.id = task_assignees.task_id
        and t.primary_owner_id is null
        and (public.is_subsystem_member(t.subsystem_id) or public.is_team_wide_subsystem(t.subsystem_id))
    )
  );

create or replace function public.accept_task(p_task_id uuid)
returns void
language plpgsql
as $$
declare
  v_subsystem_id text;
  v_primary_owner_id uuid;
begin
  select subsystem_id, primary_owner_id into v_subsystem_id, v_primary_owner_id
  from public.tasks
  where id = p_task_id;

  if v_subsystem_id is null then
    raise exception 'Task not found, or you are not allowed to accept it' using errcode = '42501';
  end if;

  if not (public.is_approved() and (public.is_subsystem_member(v_subsystem_id) or public.is_team_wide_subsystem(v_subsystem_id))) then
    raise exception 'Task not found, or you are not allowed to accept it' using errcode = '42501';
  end if;

  if v_primary_owner_id is not null then
    raise exception 'This task has already been accepted by someone else' using errcode = '55000';
  end if;

  insert into public.task_assignees (task_id, user_id, role)
  values (p_task_id, auth.uid(), 'primary');
end;
$$;

revoke execute on function public.accept_task(uuid) from public;
revoke execute on function public.accept_task(uuid) from anon, authenticated;
grant execute on function public.accept_task(uuid) to authenticated;

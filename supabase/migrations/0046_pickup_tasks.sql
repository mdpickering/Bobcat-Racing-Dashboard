-- =========================================================
-- 0046_pickup_tasks.sql
-- The "Pick up a task" board: small tasks that anyone on the team can grab, from any subsystem.
-- Builds on 0004 (tasks, task_assignees) and 0024 (self-accept) and reuses their pattern: a task is "unowned" when
-- tasks.primary_owner_id is null, and taking one is an ordinary 'primary' task_assignees row, which the existing
-- sync_task_primary_owner trigger turns into primary_owner_id. Nothing about how tasks are owned, shown or notified changes.
--
-- Why functions: task visibility (0004) only lets a person read tasks in their own subsystem, and only a lead/admin can
-- add or remove an assignee. A board that lets ANYONE grab ANY subsystem's small task has to cross both rules, so the
-- three actions below are SECURITY DEFINER functions that do exactly one checked thing each:
--   list_pickup_tasks()          the board: unowned, open tasks that a lead/COO/admin marked with a size; any approved user
--   claim_pickup_task(task)      take one: at most 2 open pick-up tasks per person at a time
--   release_pickup_task(task)    put one of your own back (only while it is To Do / In Progress)
--   set_task_size(task, size)    put a task on the board (or take it off): the subsystem's lead, the COO, cto/admin
--
-- A task is "on the board" simply because its size is set. Size: quick (~15 min), short (~1 hour), half_day.
-- =========================================================

alter table public.tasks
  add column size text check (size is null or size in ('quick', 'short', 'half_day'));

create index tasks_pickup_idx on public.tasks (size) where size is not null;

-- ---------------------------------------------------------
-- The board
-- ---------------------------------------------------------
create or replace function public.list_pickup_tasks()
returns table (
  id uuid,
  title text,
  description text,
  subsystem_id text,
  subsystem_name text,
  size text,
  priority public.task_priority,
  deadline timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_approved() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select t.id, t.title, t.description, t.subsystem_id, s.name, t.size, t.priority, t.deadline, t.created_at
      from public.tasks t
      join public.subsystems s on s.id = t.subsystem_id
     where t.size is not null
       and t.primary_owner_id is null
       and t.status <> 'Complete'
     order by t.created_at;
end;
$$;

revoke execute on function public.list_pickup_tasks() from public;
revoke execute on function public.list_pickup_tasks() from anon, authenticated;
grant execute on function public.list_pickup_tasks() to authenticated;

-- ---------------------------------------------------------
-- Taking one (max 2 open pick-up tasks per person)
-- ---------------------------------------------------------
create or replace function public.claim_pickup_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks%rowtype;
  v_open integer;
begin
  if auth.uid() is null or not public.is_approved() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  -- lock the row so two people clicking at once cannot both get it
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found or v_task.size is null then
    raise exception 'That task is not on the pick-up board' using errcode = 'P0002';
  end if;
  if v_task.status = 'Complete' then
    raise exception 'That task is already complete' using errcode = '55000';
  end if;
  if v_task.primary_owner_id is not null then
    raise exception 'Someone else just picked that one up' using errcode = '55000';
  end if;

  select count(*) into v_open
    from public.tasks
   where size is not null and primary_owner_id = auth.uid() and status <> 'Complete';
  if v_open >= 2 then
    raise exception 'You already have 2 pick-up tasks. Finish or put one back first.' using errcode = '54000';
  end if;

  insert into public.task_assignees (task_id, user_id, role) values (p_task_id, auth.uid(), 'primary');
end;
$$;

revoke execute on function public.claim_pickup_task(uuid) from public;
revoke execute on function public.claim_pickup_task(uuid) from anon, authenticated;
grant execute on function public.claim_pickup_task(uuid) to authenticated;

-- ---------------------------------------------------------
-- Putting one back
-- ---------------------------------------------------------
create or replace function public.release_pickup_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks%rowtype;
begin
  if auth.uid() is null or not public.is_approved() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_task from public.tasks where id = p_task_id for update;
  if not found or v_task.size is null or v_task.primary_owner_id is distinct from auth.uid() then
    raise exception 'That is not one of your pick-up tasks' using errcode = '42501';
  end if;
  if v_task.status not in ('To Do', 'In Progress') then
    raise exception 'Only a task that is To Do or In Progress can be put back. Ask a lead for anything further along.' using errcode = '55000';
  end if;

  delete from public.task_assignees where task_id = p_task_id and user_id = auth.uid() and role = 'primary';
  -- a task someone started and gave up goes back to the board as To Do
  if v_task.status = 'In Progress' then
    update public.tasks set status = 'To Do' where id = p_task_id;
  end if;
end;
$$;

revoke execute on function public.release_pickup_task(uuid) from public;
revoke execute on function public.release_pickup_task(uuid) from anon, authenticated;
grant execute on function public.release_pickup_task(uuid) to authenticated;

-- ---------------------------------------------------------
-- Putting a task on the board (or taking it off): a size makes it a pick-up task, NULL removes it
-- ---------------------------------------------------------
create or replace function public.set_task_size(p_task_id uuid, p_size text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subsystem text;
begin
  if p_size is not null and p_size not in ('quick', 'short', 'half_day') then
    raise exception 'Size must be quick, short or half_day' using errcode = '22023';
  end if;

  select subsystem_id into v_subsystem from public.tasks where id = p_task_id;
  if v_subsystem is null then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
  if not (public.is_cto_or_admin() or public.is_coo() or public.is_subsystem_lead(v_subsystem)) then
    raise exception 'Only the subsystem lead, the COO, the CTO or an admin can change what is on the pick-up board' using errcode = '42501';
  end if;

  update public.tasks set size = p_size where id = p_task_id;
end;
$$;

revoke execute on function public.set_task_size(uuid, text) from public;
revoke execute on function public.set_task_size(uuid, text) from anon, authenticated;
grant execute on function public.set_task_size(uuid, text) to authenticated;

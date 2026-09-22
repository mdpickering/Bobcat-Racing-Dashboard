-- =========================================================
-- 0024_task_self_accept.sql
-- New capability (owner request, post-cutover): an approved member of a
-- subsystem may accept/claim an unassigned task in that subsystem for
-- themselves, without needing a lead/admin to assign it. Builds on
-- 0001-0023's existing helper functions and patterns; does not create a
-- parallel authorization system.
--
-- ---------------------------------------------------------
-- Pre-existing bug this migration also fixes (found while rehearsing this
-- feature, not previously exercised): tasks_before_write (0004) protects
-- primary_owner_id from anyone but a lead/admin by reverting it to
-- old.primary_owner_id on UPDATE. But the ONLY path that is ever supposed
-- to change primary_owner_id is sync_task_primary_owner's own
-- SECURITY DEFINER update, triggered by a task_assignees insert/update/
-- delete — and that update ALSO fires tasks_before_write (same table),
-- under the ORIGINAL caller's auth.uid(), not the definer's privilege.
-- So whenever the caller who triggered the assignee change is a plain
-- member (not lead/admin of that subsystem), tasks_before_write silently
-- reverted the sync right back to its old value. This was never observed
-- before because, until now, only leads/admins (who pass the check)
-- ever inserted into task_assignees at all. Fix: sync_task_primary_owner
-- sets a transaction-local flag before its update; tasks_before_write
-- lets primary_owner_id through when that flag is set, in addition to
-- its existing lead/admin exception. Both functions are re-created here
-- with that one addition — everything else about them is unchanged.
-- ---------------------------------------------------------
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
        new.deadline := old.deadline;
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

create or replace function public.sync_task_primary_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Transaction-local (is_local=true): reverts automatically at the end of this
  -- transaction, so it can never leak into an unrelated later statement on a
  -- pooled connection.
  perform set_config('bobcat.sync_primary_owner', 'true', true);

  if tg_op = 'DELETE' then
    if old.role = 'primary' then
      update public.tasks set primary_owner_id = null
      where id = old.task_id and primary_owner_id = old.user_id;
    end if;
    return old;
  end if;

  if new.role = 'primary' then
    update public.tasks set primary_owner_id = new.user_id where id = new.task_id;
  elsif tg_op = 'UPDATE' and old.role = 'primary' then
    update public.tasks set primary_owner_id = null
    where id = new.task_id and primary_owner_id = old.user_id;
  end if;
  return new;
end;
$$;

-- Re-assert privileges (create or replace preserves existing grants, but this
-- keeps the migration self-contained the same way 0021 does).
revoke execute on function public.sync_task_primary_owner() from public;
revoke execute on function public.sync_task_primary_owner() from anon, authenticated;

-- ---------------------------------------------------------
-- The new self-accept capability itself. Two layers, matching the pattern
-- established in 0022:
--   1. task_assignees_self_accept — an additional PERMISSIVE insert
--      policy on task_assignees (OR'd with the existing lead/admin
--      policy from 0004, which is untouched — their capability is
--      unchanged). Lets an approved member insert THEMSELVES as
--      'primary' on a task that currently has no primary_owner_id, in a
--      subsystem they belong to. This alone is real, standalone
--      enforcement: even a raw REST insert that bypasses the RPC below
--      is still checked against this policy.
--   2. accept_task(uuid) — a thin SECURITY INVOKER wrapper (like
--      create_purchase_request/review_task_request in 0022): re-checks
--      the same authorization explicitly so a disallowed attempt gets a
--      clear 42501 error instead of a silently-empty RLS result, then
--      performs the exact same insert the policy above would allow.
--      SECURITY INVOKER on purpose — the insert still runs under the
--      caller's own grants + RLS, so the function is one more layer, not
--      a bypass.
--
-- "Unassigned" = tasks.primary_owner_id is null, the same concept the
-- app's own UI already uses ("No primary owner assigned"). Accepting
-- sets role='primary' via the existing task_assignees mechanism — the
-- sync_task_primary_owner trigger above keeps tasks.primary_owner_id in
-- sync (now correctly, per the fix above), and the pre-existing
-- notify_task_assignment trigger (0016) already skips notifying a user
-- about their own action, so self-accept needs no changes to either.
--
-- Does not touch: tasks.status/priority/deadline/subsystem_id/
-- category_id or any other field; the existing lead/admin assignment
-- policies (task_assignees_insert/_update/_delete from 0004), which
-- keep working exactly as before; task visibility RLS (tasks_select);
-- any other table; workspace_state; the old legacy project.
-- ---------------------------------------------------------
-- drop-then-create makes this statement safe to re-run (e.g. after a lock
-- conflict from running the script twice at once aborts a partial attempt).
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
        and public.is_subsystem_member(t.subsystem_id)
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

  if not (public.is_approved() and public.is_subsystem_member(v_subsystem_id)) then
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

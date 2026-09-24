-- =========================================================
-- 0030_delete_tasks.sql
-- CTO/Admin, and the team lead of a task's own subsystem, can delete that
-- task. Until now tasks had no delete grant or policy at all ("archive via
-- status"), so nobody could — not even an admin. Same pattern as delete for
-- CAD reviews and purchase requests (0022): a narrow policy plus cleanup of
-- what points at the row without a foreign key.
--
-- Who: one rule, can_delete_task(), used by both the table policy and the
-- Storage policy so they cannot drift apart:
--     cto/admin (any task, including imported ones — the old project is
--     still the untouched source of truth for migrated data), OR
--     is_subsystem_lead(task's subsystem) — the same test that already
--     lets a lead create and edit tasks in their own subsystem.
-- Members and the COO get no delete path. A lead cannot delete a task in a
-- subsystem they do not lead.
--
-- What goes with a deleted task, via the existing ON DELETE rules:
--   CASCADE   task_assignees, task_comments (+ their mentions),
--             task_attachments rows, task_due_soon_notified
--   SET NULL  cad_reviews.task_id, task_requests.converted_task_id
--             (the review / request itself is kept)
-- notifications point at a task by (entity_type, entity_id) with no foreign
-- key, so a BEFORE DELETE trigger removes the now-dangling ones; queued
-- emails for them go with them (email_outbox cascades from notifications).
--
-- Uploaded files live in Storage, which SQL cannot remove reliably, so the
-- app removes a task's files through the Storage API before deleting the
-- task. That needs a Storage delete policy on the task-attachments bucket,
-- using the same can_delete_task() rule (files are keyed "<task_id>/...").
-- =========================================================

create or replace function public.can_delete_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_cto_or_admin()
      or exists (
        select 1 from public.tasks t
         where t.id = p_task_id and public.is_subsystem_lead(t.subsystem_id)
      );
$$;

revoke execute on function public.can_delete_task(uuid) from public;
revoke execute on function public.can_delete_task(uuid) from anon, authenticated;
grant execute on function public.can_delete_task(uuid) to authenticated;

create policy tasks_delete
  on public.tasks
  for delete
  to authenticated
  using (public.can_delete_task(id));

grant delete on public.tasks to authenticated;

create or replace function public.tasks_cleanup_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications where entity_type = 'task' and entity_id = old.id;
  return old;
end;
$$;

revoke execute on function public.tasks_cleanup_on_delete() from public;
revoke execute on function public.tasks_cleanup_on_delete() from anon, authenticated;

create trigger tasks_cleanup_on_delete
  before delete on public.tasks
  for each row execute function public.tasks_cleanup_on_delete();

create policy task_attachments_storage_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'task-attachments'
    and public.can_delete_task(nullif((storage.foldername(name))[1], '')::uuid)
  );

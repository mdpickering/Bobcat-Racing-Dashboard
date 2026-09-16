-- =========================================================
-- 0009_fix_cad_review_current_revision_lock.sql
-- Phase 6.2D patch — fixes a genuine defect found during
-- verification: cad_reviews_before_write unconditionally reset
-- current_revision back to its old value on every UPDATE,
-- including the internal UPDATE that
-- set_cad_review_version_defaults() issues to actually apply
-- the new revision number. The two triggers fought each other,
-- so current_revision never advanced past 0 even though
-- versions were being created correctly with the right
-- revision_number (verification tests C4/C5 passed, C4b/C5b
-- failed with current_revision stuck at 0).
--
-- The lock line was also redundant: current_revision was never
-- in cad_reviews' UPDATE grant at all (confirmed by
-- verification test C16 — any client attempt to set it
-- directly gets a hard permission error before this trigger
-- even runs), so removing the trigger-level lock does not
-- weaken protection against client spoofing; it only stops the
-- trigger from overwriting the legitimate internal sync write.
--
-- Does NOT modify 0001-0008. Does not touch workspace_state or
-- any legacy table, and does not migrate any production data.
-- Run against bobcat-dev only.
-- =========================================================

create or replace function public.cad_reviews_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.submitted_by := auth.uid();
    new.status := 'Draft';
    new.reviewer_id := null;
    new.reviewed_at := null;
    new.current_revision := 0;
  elsif tg_op = 'UPDATE' then
    new.submitted_by := old.submitted_by;

    if new.status = 'Approved for Manufacturing'
       and old.status is distinct from new.status
       and not public.is_cto_or_admin() then
      raise exception 'Only CTO/Admin can set Approved for Manufacturing';
    end if;

    if not (public.is_cto_or_admin() or public.is_subsystem_lead(old.subsystem_id)) then
      new.subsystem_id := old.subsystem_id;
      if new.status not in ('Draft', 'Submitted for Review') then
        new.status := old.status;
      end if;
    end if;

    if new.status in ('Changes Requested', 'Approved', 'Approved for Manufacturing')
       and old.status is distinct from new.status
       and (public.is_cto_or_admin() or public.is_subsystem_lead(old.subsystem_id)) then
      new.reviewer_id := auth.uid();
      new.reviewed_at := now();
    else
      new.reviewer_id := old.reviewer_id;
      new.reviewed_at := old.reviewed_at;
    end if;
  end if;

  if new.task_id is not null and not exists (
    select 1 from public.tasks t where t.id = new.task_id and t.subsystem_id = new.subsystem_id
  ) then
    raise exception 'task_id % does not belong to subsystem %', new.task_id, new.subsystem_id;
  end if;

  return new;
end;
$$;

-- =========================================================
-- 0020_admin_user_management.sql
-- Phase 6.4: privileged mutation of profiles.role/approved/active
-- for CTO/Admin, plus an automatic notification when a member
-- application is reviewed. Builds on 0001-0019 and reuses their
-- security patterns exactly.
--
-- role/approved/active were deliberately left out of the
-- profiles UPDATE grant in 0001 ("Admin will update those fields
-- later via a server-side route... not built in this phase").
-- This is that later phase — but the mechanism is a SECURITY
-- DEFINER RPC function, not a service-role backend route: a
-- plain column grant can't be scoped per-row, so granting
-- update(role, approved, active) to `authenticated` broadly would
-- let a user change these on their OWN row too (since
-- profiles_update_own's USING clause already matches id =
-- auth.uid()), which is exactly what "users cannot change their
-- own role/approval/active state" forbids. A SECURITY DEFINER
-- function sidesteps this: it runs as the table owner (bypassing
-- RLS and grants entirely, same mechanism as
-- log_purchase_status_change and every other privileged writer
-- in this schema), and does its own explicit is_cto_or_admin()
-- and self-modification checks inside the function body instead
-- of relying on row-level policy matching.
--
-- Does NOT touch workspace_state or any legacy table, and does
-- not migrate any production data. Run against bobcat-dev only.
-- =========================================================

create or replace function public.admin_set_user_role(p_user_id uuid, p_role public.user_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_cto_or_admin() then
    raise exception 'Only CTO/Admin can change a user role';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own role';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
end;
$$;

revoke execute on function public.admin_set_user_role(uuid, public.user_role) from public;
revoke execute on function public.admin_set_user_role(uuid, public.user_role) from anon, authenticated;
grant execute on function public.admin_set_user_role(uuid, public.user_role) to authenticated;

create or replace function public.admin_set_user_approved(p_user_id uuid, p_approved boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_cto_or_admin() then
    raise exception 'Only CTO/Admin can change a user''s approval status';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own approval status';
  end if;
  update public.profiles set approved = p_approved where id = p_user_id;
end;
$$;

revoke execute on function public.admin_set_user_approved(uuid, boolean) from public;
revoke execute on function public.admin_set_user_approved(uuid, boolean) from anon, authenticated;
grant execute on function public.admin_set_user_approved(uuid, boolean) to authenticated;

create or replace function public.admin_set_user_active(p_user_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_cto_or_admin() then
    raise exception 'Only CTO/Admin can change a user''s active status';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot deactivate your own account';
  end if;
  update public.profiles set active = p_active where id = p_user_id;
end;
$$;

revoke execute on function public.admin_set_user_active(uuid, boolean) from public;
revoke execute on function public.admin_set_user_active(uuid, boolean) from anon, authenticated;
grant execute on function public.admin_set_user_active(uuid, boolean) to authenticated;

-- ---------------------------------------------------------
-- member_applications: notify the applicant's linked profile
-- when their application is approved or rejected. Same pattern
-- as notify_task_request_reviewed() from 0016 — a plain member
-- has no notifications-insert grant, so this has to be a
-- SECURITY DEFINER trigger, not a client-side insert.
-- ---------------------------------------------------------
create or replace function public.notify_member_application_reviewed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = old.status or new.status not in ('approved', 'rejected') then
    return new;
  end if;
  if new.linked_profile_id is null or new.linked_profile_id = auth.uid() then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
  values (
    new.linked_profile_id,
    case when new.status = 'approved' then 'account_approval' else 'account_rejection' end,
    case when new.status = 'approved' then 'Your membership application was approved' else 'Your membership application was not approved' end,
    null,
    'member_application',
    new.id
  );

  return new;
end;
$$;

revoke execute on function public.notify_member_application_reviewed() from public;
revoke execute on function public.notify_member_application_reviewed() from anon, authenticated;

create trigger member_applications_notify_reviewed
  after update on public.member_applications
  for each row execute function public.notify_member_application_reviewed();

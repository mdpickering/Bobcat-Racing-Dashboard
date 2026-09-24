-- =========================================================
-- 0027_purchasing_visibility_and_explicit_approval.sql
-- Two changes to purchasing, built on 0007/0022 and reusing their
-- patterns (SECURITY DEFINER boolean helpers, trigger-derived audit
-- fields, transaction-local flag for a privileged path). Does not touch
-- any existing row, workspace_state, or any legacy table.
--
-- PART 1 — every approved, active user can READ all purchasing records.
--   Previously a plain member only saw requests of subsystems they
--   belong to. Read access is widened to any approved+active profile
--   (cto/admin are approved by definition; a subsystem lead keeps their
--   own access). Only SELECT changes: insert/update/delete rules on
--   purchase_requests and purchase_request_items are untouched, so a
--   member still cannot create, edit, approve, order or delete anything.
--   can_access_purchase_request() is the single rule that also backs the
--   line-items and status-history SELECT policies, so those widen in
--   step and cannot drift out of sync.
--
-- PART 2 — "Approved" is reached ONLY through approve_purchase_request().
--   Before: a cto/admin approved a request by picking "Approved" in a
--   status dropdown (a plain UPDATE of status). Now the purchase_requests
--   trigger rejects any transition into 'Approved' unless it comes from
--   the explicit RPC (which sets a transaction-local flag, exactly like
--   0024's bobcat.sync_primary_owner). The RPC itself:
--     * requires cto/admin (explicit 42501, not a silent no-op),
--     * requires the request to be in an approvable state
--       ('Submitted' or 'Under Review'),
--     * updates the status under the CALLER's own grants + RLS
--       (SECURITY INVOKER — it adds a check, never a bypass).
--   reviewed_by / reviewed_at are still stamped by the existing trigger
--   from auth.uid() on the first transition into Approved/Rejected, and
--   the existing status-history trigger still logs the change with the
--   approver as changed_by. The other statuses (Ordered, In Transit, ...,
--   and Rejected) keep working through the existing status update path.
--   The guard is skipped only when auth.uid() is null (service role / SQL
--   editor maintenance); every API caller has a JWT subject, so the
--   guard always applies to them.
-- =========================================================

-- ---------------------------------------------------------
-- PART 1
-- ---------------------------------------------------------
create or replace function public.can_access_purchase_request(p_purchase_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.purchase_requests pr
    where pr.id = p_purchase_request_id
      and (
        public.is_approved()
        or public.is_cto_or_admin()
        or public.is_subsystem_lead(pr.subsystem_id)
      )
  );
$$;

revoke execute on function public.can_access_purchase_request(uuid) from public;
revoke execute on function public.can_access_purchase_request(uuid) from anon, authenticated;
grant execute on function public.can_access_purchase_request(uuid) to authenticated;

drop policy purchase_requests_select on public.purchase_requests;

create policy purchase_requests_select
  on public.purchase_requests
  for select
  to authenticated
  using (
    public.is_approved()
    or public.is_cto_or_admin()
    or public.is_subsystem_lead(subsystem_id)
  );

-- ---------------------------------------------------------
-- PART 2
-- ---------------------------------------------------------
create or replace function public.purchase_requests_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.requested_by := auth.uid();
    new.status := 'Draft';
    new.reviewed_by := null;
    new.reviewed_at := null;
  elsif tg_op = 'UPDATE' then
    new.requested_by := old.requested_by;

    if not public.is_cto_or_admin() then
      new.subsystem_id := old.subsystem_id;

      if new.status in ('Approved', 'Rejected') and old.status is distinct from new.status then
        raise exception 'Only CTO/Admin can approve or reject a purchase request';
      end if;
    end if;

    -- Approval is an explicit action, never a plain status edit. Skipped only
    -- when there is no authenticated caller at all (service role / SQL editor).
    if new.status = 'Approved'
       and old.status is distinct from 'Approved'
       and auth.uid() is not null
       and current_setting('bobcat.purchase_approval', true) is distinct from 'true' then
      raise exception 'A purchase request can only be approved with the Approve Purchase action'
        using errcode = '42501';
    end if;

    if new.status in ('Approved', 'Rejected') and old.status not in ('Approved', 'Rejected') then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    else
      new.reviewed_by := old.reviewed_by;
      new.reviewed_at := old.reviewed_at;
    end if;
  end if;

  return new;
end;
$$;

-- SECURITY INVOKER on purpose (same as create_purchase_request and
-- review_task_request): the UPDATE runs under the caller's own grants +
-- RLS + the trigger above, so the RPC is one layer of several.
create or replace function public.approve_purchase_request(p_request_id uuid)
returns void
language plpgsql
as $$
declare
  r public.purchase_requests;
  v_rows integer;
begin
  if not public.is_cto_or_admin() then
    raise exception 'Only the CTO or an admin can approve a purchase request'
      using errcode = '42501';
  end if;

  select * into r from public.purchase_requests where id = p_request_id;
  if not found then
    raise exception 'Purchase request not found' using errcode = 'P0002';
  end if;

  if r.status not in ('Submitted', 'Under Review') then
    raise exception 'Only a Submitted or Under Review purchase request can be approved (this one is %)', r.status
      using errcode = '55000';
  end if;

  perform set_config('bobcat.purchase_approval', 'true', true);

  update public.purchase_requests
     set status = 'Approved'
   where id = p_request_id and status = r.status;
  get diagnostics v_rows = row_count;

  perform set_config('bobcat.purchase_approval', '', true);

  if v_rows = 0 then
    raise exception 'This purchase request changed while you were approving it; reload and try again'
      using errcode = '55000';
  end if;
end;
$$;

revoke execute on function public.approve_purchase_request(uuid) from public;
revoke execute on function public.approve_purchase_request(uuid) from anon, authenticated;
grant execute on function public.approve_purchase_request(uuid) to authenticated;

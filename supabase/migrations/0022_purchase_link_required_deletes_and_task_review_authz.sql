-- =========================================================
-- 0022_purchase_link_required_deletes_and_task_review_authz.sql
-- Functional fix pass (post Phase 6.8), three independent parts.
-- Builds on 0001-0021 and reuses their security patterns
-- (SECURITY DEFINER helpers with the full PUBLIC + anon/
-- authenticated EXECUTE revoke, restrictive-policy layering,
-- trigger-derived audit fields). Does NOT touch workspace_state
-- or any legacy table and does NOT modify any existing row.
-- Apply to bobcat-dev only, in the Supabase SQL Editor.
--
-- PART 1 — purchase requests need a product link.
--   The existing URL field is purchase_request_items.link (one per
--   line item); purchase_requests itself has none, so no new
--   column is added. A request must have >= 1 line item with a
--   valid http(s) link, enforced in the database:
--     * item trigger: link must be a valid http(s) URL on every
--       insert, and whenever it changes on update;
--     * deferred constraint trigger on purchase_requests: a newly
--       inserted request must have a linked item by COMMIT — so a
--       raw REST insert of a bare request fails;
--     * deferred constraint trigger on item delete: cannot remove
--       the last linked item of a surviving request;
--     * create_purchase_request(): the atomic RPC the app uses
--       (request + first line item in one transaction).
--   Existing rows are never validated or modified (none exist).
--
-- PART 2 — delete for CAD reviews and purchase requests.
--   Neither table had a delete policy or grant (archive-over-
--   delete). Delete is now allowed, narrowly:
--     * cto/admin: any row that was NOT imported (legacy_id is
--       null) — migrated history stays protected;
--     * the creator: only their own row while it is still 'Draft'
--       (and, for CAD, only if nobody else has commented) — least
--       privilege, so a mistaken draft can be removed but nothing
--       that has entered review/purchasing can.
--   Versions/comments/items/history go with the row through the
--   existing ON DELETE CASCADE foreign keys. notifications point
--   at these rows by (entity_type, entity_id) with no foreign key,
--   so a BEFORE DELETE trigger removes the now-dangling ones. No
--   other table (audit_logs, migration_log, migration_exceptions)
--   is touched.
--
-- PART 3 — task-request approval authorization.
--   "Approve" (and Decline) on a task request previously relied
--   on RLS only, which let ANY user flagged as a subsystem lead
--   in subsystem_members review — including someone whose profile
--   role is plain 'member' — and let the client set reviewed_by/
--   reviewed_at. Now, one explicit reusable rule
--   can_review_task_request(subsystem_id) backs the RLS policy,
--   a trigger and the review_task_request() RPC:
--     cto/admin, OR (profile role = 'team_lead' AND lead of that
--     subsystem). Members can never review. The RPC raises an
--     explicit 42501 error (a bare RLS-blocked UPDATE is only a
--     silent 0-row no-op) and creates the task + marks the request
--     atomically. reviewed_by/reviewed_at are always derived
--     server-side.
-- =========================================================

-- ---------------------------------------------------------
-- PART 1
-- ---------------------------------------------------------
create or replace function public.is_valid_http_url(p_url text)
returns boolean
language sql
immutable
as $$
  select p_url is not null
     and length(p_url) <= 2048
     and p_url ~* '^https?://[^[:space:]/?#@]+\.[^[:space:]/?#@]+([/?#][^[:space:]]*)?$';
$$;

revoke execute on function public.is_valid_http_url(text) from public;
revoke execute on function public.is_valid_http_url(text) from anon, authenticated;
grant execute on function public.is_valid_http_url(text) to authenticated;

create or replace function public.purchase_request_items_require_link()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.link := btrim(new.link);
    if not public.is_valid_http_url(new.link) then
      raise exception 'A valid product link (http:// or https://) is required for every purchase line item'
        using errcode = '23514';
    end if;
  elsif new.link is distinct from old.link then
    new.link := btrim(new.link);
    if not public.is_valid_http_url(new.link) then
      raise exception 'A valid product link (http:// or https://) is required for every purchase line item'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger purchase_request_items_require_link
  before insert or update on public.purchase_request_items
  for each row execute function public.purchase_request_items_require_link();

-- Reads purchase_request_items regardless of the caller's RLS (boolean
-- effect only), so the check can never spuriously fail for lack of SELECT.
create or replace function public.assert_purchase_request_has_linked_item(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- the request may be gone (deleted, or cascading from its own delete)
  if not exists (select 1 from public.purchase_requests where id = p_request_id) then
    return;
  end if;
  if not exists (
    select 1 from public.purchase_request_items
    where purchase_request_id = p_request_id and public.is_valid_http_url(link)
  ) then
    raise exception 'A purchase request needs at least one line item with a valid product link (http:// or https://)'
      using errcode = '23514';
  end if;
end;
$$;

revoke execute on function public.assert_purchase_request_has_linked_item(uuid) from public;
revoke execute on function public.assert_purchase_request_has_linked_item(uuid) from anon, authenticated;

-- The two trigger wrappers are SECURITY DEFINER so they can call the (locked
-- down) assert function above; the caller never needs EXECUTE on it directly.
create or replace function public.purchase_requests_require_linked_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_purchase_request_has_linked_item(new.id);
  return null;
end;
$$;

revoke execute on function public.purchase_requests_require_linked_item() from public;
revoke execute on function public.purchase_requests_require_linked_item() from anon, authenticated;

create constraint trigger purchase_requests_require_linked_item
  after insert on public.purchase_requests
  deferrable initially deferred
  for each row execute function public.purchase_requests_require_linked_item();

create or replace function public.purchase_request_items_keep_linked_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_purchase_request_has_linked_item(old.purchase_request_id);
  return null;
end;
$$;

revoke execute on function public.purchase_request_items_keep_linked_item() from public;
revoke execute on function public.purchase_request_items_keep_linked_item() from anon, authenticated;

create constraint trigger purchase_request_items_keep_linked_item
  after delete on public.purchase_request_items
  deferrable initially deferred
  for each row execute function public.purchase_request_items_keep_linked_item();

-- SECURITY INVOKER on purpose: both inserts run under the caller's own
-- grants + RLS (only cto/admin or the subsystem's lead may create), so this
-- adds a check, never a bypass. One call = one transaction, so the request
-- and its first linked item commit (or fail) together.
create or replace function public.create_purchase_request(
  p_subsystem_id text,
  p_title text,
  p_description text,
  p_vendor text,
  p_product_url text
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_url text := btrim(p_product_url);
begin
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'A title is required' using errcode = '23514';
  end if;
  if not public.is_valid_http_url(v_url) then
    raise exception 'A valid product link (http:// or https://) is required'
      using errcode = '23514';
  end if;

  insert into public.purchase_requests (subsystem_id, title, description, vendor)
  values (p_subsystem_id, btrim(p_title), nullif(btrim(p_description), ''), nullif(btrim(p_vendor), ''))
  returning id into v_id;

  insert into public.purchase_request_items (purchase_request_id, description, quantity, link)
  values (v_id, btrim(p_title), 1, v_url);

  return v_id;
end;
$$;

revoke execute on function public.create_purchase_request(text, text, text, text, text) from public;
revoke execute on function public.create_purchase_request(text, text, text, text, text) from anon, authenticated;
grant execute on function public.create_purchase_request(text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------
-- PART 2
-- ---------------------------------------------------------
create policy purchase_requests_delete
  on public.purchase_requests
  for delete
  to authenticated
  using (
    legacy_id is null
    and (
      public.is_cto_or_admin()
      or (requested_by = auth.uid() and status = 'Draft' and public.is_active_user())
    )
  );

create policy cad_reviews_delete
  on public.cad_reviews
  for delete
  to authenticated
  using (
    legacy_id is null
    and (
      public.is_cto_or_admin()
      or (
        submitted_by = auth.uid()
        and status = 'Draft'
        and public.is_active_user()
        and not exists (
          select 1 from public.cad_review_comments c
          where c.cad_review_id = cad_reviews.id and c.user_id <> auth.uid()
        )
      )
    )
  );

grant delete on public.purchase_requests to authenticated;
grant delete on public.cad_reviews to authenticated;

-- notifications.entity_id has no foreign key, so remove the notifications
-- that would otherwise point at a deleted row. SECURITY DEFINER because
-- notifications has no delete grant for anyone via the API.
create or replace function public.purchase_requests_cleanup_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications where entity_type = 'purchase_request' and entity_id = old.id;
  return old;
end;
$$;

revoke execute on function public.purchase_requests_cleanup_on_delete() from public;
revoke execute on function public.purchase_requests_cleanup_on_delete() from anon, authenticated;

create trigger purchase_requests_cleanup_on_delete
  before delete on public.purchase_requests
  for each row execute function public.purchase_requests_cleanup_on_delete();

create or replace function public.cad_reviews_cleanup_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications where entity_type = 'cad_review' and entity_id = old.id;
  return old;
end;
$$;

revoke execute on function public.cad_reviews_cleanup_on_delete() from public;
revoke execute on function public.cad_reviews_cleanup_on_delete() from anon, authenticated;

create trigger cad_reviews_cleanup_on_delete
  before delete on public.cad_reviews
  for each row execute function public.cad_reviews_cleanup_on_delete();

-- ---------------------------------------------------------
-- PART 3
-- ---------------------------------------------------------
-- The single, explicit rule for who may approve/decline a task request.
create or replace function public.can_review_task_request(p_subsystem_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_cto_or_admin()
      or (
        exists (
          select 1 from public.profiles
          where id = auth.uid() and role = 'team_lead' and approved = true and active = true
        )
        and public.is_subsystem_lead(p_subsystem_id)
      );
$$;

revoke execute on function public.can_review_task_request(text) from public;
revoke execute on function public.can_review_task_request(text) from anon, authenticated;
grant execute on function public.can_review_task_request(text) to authenticated;

drop policy task_requests_update_review on public.task_requests;

create policy task_requests_update_review
  on public.task_requests
  for update
  to authenticated
  using (public.can_review_task_request(subsystem_id))
  with check (public.can_review_task_request(subsystem_id));

create or replace function public.task_requests_enforce_review()
returns trigger
language plpgsql
as $$
begin
  if (new.status is distinct from old.status
      or new.converted_task_id is distinct from old.converted_task_id)
     and not public.can_review_task_request(old.subsystem_id) then
    raise exception 'Only a team lead of this subsystem, the CTO or an admin can approve or decline task requests'
      using errcode = '42501';
  end if;

  -- reviewed_by / reviewed_at are never client-supplied
  if old.status = 'pending' and new.status in ('approved', 'declined') then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  else
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  end if;

  return new;
end;
$$;

create trigger task_requests_enforce_review
  before update on public.task_requests
  for each row execute function public.task_requests_enforce_review();

-- Atomic approve/decline with an explicit authorization error. SECURITY
-- INVOKER: the task insert and the request update still run under the
-- caller's own grants + RLS, so the function check is one layer of
-- several (function, RLS policy, trigger), never a bypass.
create or replace function public.review_task_request(p_request_id uuid, p_decision text)
returns uuid
language plpgsql
as $$
declare
  r public.task_requests;
  v_task_id uuid;
begin
  if p_decision not in ('approved', 'declined') then
    raise exception 'Decision must be approved or declined' using errcode = '22023';
  end if;

  select * into r from public.task_requests where id = p_request_id;
  if not found then
    raise exception 'Task request not found, or you are not allowed to review it' using errcode = '42501';
  end if;

  if not public.can_review_task_request(r.subsystem_id) then
    raise exception 'Only a team lead of this subsystem, the CTO or an admin can approve or decline task requests'
      using errcode = '42501';
  end if;

  if r.status <> 'pending' then
    raise exception 'This task request has already been reviewed' using errcode = '55000';
  end if;

  if p_decision = 'approved' then
    insert into public.tasks (title, description, subsystem_id, priority)
    values (r.title, r.description, r.subsystem_id, 'Medium')
    returning id into v_task_id;
  end if;

  update public.task_requests
     set status = p_decision::public.task_request_status,
         converted_task_id = v_task_id
   where id = p_request_id and status = 'pending';

  if not found then
    raise exception 'This task request has already been reviewed' using errcode = '55000';
  end if;

  return v_task_id;
end;
$$;

revoke execute on function public.review_task_request(uuid, text) from public;
revoke execute on function public.review_task_request(uuid, text) from anon, authenticated;
grant execute on function public.review_task_request(uuid, text) to authenticated;

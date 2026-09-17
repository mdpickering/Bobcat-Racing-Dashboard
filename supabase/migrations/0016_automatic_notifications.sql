-- =========================================================
-- 0016_automatic_notifications.sql
-- Phase 6.3 Chunk 3: server-side automatic notification
-- creation for task assignment, task request review, purchase
-- status changes, CAD review status changes, and comment
-- mentions. Builds on 0001-0015 and reuses their security
-- patterns exactly.
--
-- notifications has NO insert grant to plain authenticated
-- users (only cto/admin, from 0012) — "users cannot forge
-- notifications" is true by construction. A regular member or
-- team lead triggering one of these events (assigning a
-- teammate, reviewing a task request, moving a purchase status)
-- has no notifications-insert privilege of their own, so these
-- have to be SECURITY DEFINER triggers, not client-side inserts.
-- Each function is hardened with the full 0006 EXECUTE-revoke
-- pattern (PUBLIC and anon/authenticated by name) even though
-- trigger firing doesn't itself require the invoking role to
-- hold EXECUTE — for consistency with every other privileged
-- function in this schema and to close off any direct-call path.
--
-- Every function skips notifying the acting user about their
-- own action (auth.uid() = recipient) to avoid useless noise —
-- e.g. a requester moving their own purchase from Draft to
-- Submitted doesn't need to be told they did that.
--
-- Does NOT touch workspace_state or any legacy table, and does
-- not migrate any production data. Run against bobcat-dev only.
-- =========================================================

-- ---------------------------------------------------------
-- task_assignees: notify the assignee when they're added as
-- primary owner or co-owner. Re-assigning the same person to a
-- different role (insert after a prior delete, or the primary/
-- co-owner swap in TaskAssigneesPanel) fires again, which is
-- fine — it's a new fact worth telling them about.
-- ---------------------------------------------------------
create or replace function public.notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_title text;
begin
  if new.user_id = auth.uid() then
    return new;
  end if;

  select title into v_task_title from public.tasks where id = new.task_id;

  insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
  values (
    new.user_id,
    case when new.role = 'primary' then 'task_assignment' else 'co_owner_assignment' end,
    case when new.role = 'primary' then 'You were assigned a task' else 'You were added as a co-owner' end,
    v_task_title,
    'task',
    new.task_id
  );

  return new;
end;
$$;

revoke execute on function public.notify_task_assignment() from public;
revoke execute on function public.notify_task_assignment() from anon, authenticated;

create trigger task_assignees_notify_assignment
  after insert on public.task_assignees
  for each row execute function public.notify_task_assignment();

-- ---------------------------------------------------------
-- task_requests: notify the requester when a lead/cto/admin
-- reviews their request (approved or declined).
-- ---------------------------------------------------------
create or replace function public.notify_task_request_reviewed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = old.status or new.status not in ('approved', 'declined') then
    return new;
  end if;
  if new.requester_id is null or new.requester_id = auth.uid() then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
  values (
    new.requester_id,
    'task_request_reviewed',
    case when new.status = 'approved' then 'Your task request was approved' else 'Your task request was declined' end,
    new.title,
    'task_request',
    new.id
  );

  return new;
end;
$$;

revoke execute on function public.notify_task_request_reviewed() from public;
revoke execute on function public.notify_task_request_reviewed() from anon, authenticated;

create trigger task_requests_notify_reviewed
  after update on public.task_requests
  for each row execute function public.notify_task_request_reviewed();

-- ---------------------------------------------------------
-- purchase_requests: notify the requester on every status
-- change (Submitted, Under Review, Approved, Rejected, ...).
-- ---------------------------------------------------------
create or replace function public.notify_purchase_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = old.status or new.requested_by = auth.uid() then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
  values (
    new.requested_by,
    'purchase_status',
    'Purchase request updated: ' || new.status,
    new.title,
    'purchase_request',
    new.id
  );

  return new;
end;
$$;

revoke execute on function public.notify_purchase_status_change() from public;
revoke execute on function public.notify_purchase_status_change() from anon, authenticated;

create trigger purchase_requests_notify_status_change
  after update on public.purchase_requests
  for each row execute function public.notify_purchase_status_change();

-- ---------------------------------------------------------
-- cad_reviews: notify the submitter on every status change
-- (Submitted for Review, Changes Requested, Approved, Approved
-- for Manufacturing).
-- ---------------------------------------------------------
create or replace function public.notify_cad_review_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = old.status or new.submitted_by = auth.uid() then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
  values (
    new.submitted_by,
    'cad_review',
    'CAD review updated: ' || new.status,
    new.title,
    'cad_review',
    new.id
  );

  return new;
end;
$$;

revoke execute on function public.notify_cad_review_status_change() from public;
revoke execute on function public.notify_cad_review_status_change() from anon, authenticated;

create trigger cad_reviews_notify_status_change
  after update on public.cad_reviews
  for each row execute function public.notify_cad_review_status_change();

-- ---------------------------------------------------------
-- comment_mentions: notify the mentioned user, linking back to
-- the task the comment was posted on.
-- ---------------------------------------------------------
create or replace function public.notify_comment_mention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_id uuid;
  v_commenter text;
begin
  if new.mentioned_profile_id = auth.uid() then
    return new;
  end if;

  select tc.task_id, coalesce(p.display_name, p.email)
    into v_task_id, v_commenter
    from public.task_comments tc
    join public.profiles p on p.id = tc.user_id
   where tc.id = new.comment_id;

  if v_task_id is null then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
  values (
    new.mentioned_profile_id,
    'comment_mention',
    coalesce(v_commenter, 'Someone') || ' mentioned you in a comment',
    null,
    'task',
    v_task_id
  );

  return new;
end;
$$;

revoke execute on function public.notify_comment_mention() from public;
revoke execute on function public.notify_comment_mention() from anon, authenticated;

create trigger comment_mentions_notify
  after insert on public.comment_mentions
  for each row execute function public.notify_comment_mention();

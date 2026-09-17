-- =========================================================
-- 0018_fix_comment_mention_notification_name.sql
-- Patch: notify_comment_mention() (0016) produced a notification
-- titled just "mentioned you in a comment" with the commenter's
-- name missing entirely. Root cause: profiles.display_name
-- defaults to '' (empty string), not null, for every account
-- created via handle_new_user() (0001) — so
-- coalesce(p.display_name, p.email) returned '' (a non-null
-- value) instead of falling through to email, and the outer
-- coalesce(v_commenter, 'Someone') didn't catch it either since
-- '' is also non-null. Fixed by treating '' as unset via
-- nullif() before both coalesce calls, matching how the
-- application layer already does this in JS with
-- `display_name || email`.
--
-- Verified live in-browser: a comment mention from an account
-- with an empty display_name produced a notification with no
-- name prefix. Confirmed via real browser testing (lead1
-- mentioning member1) before writing this fix.
--
-- Does NOT touch workspace_state or any legacy table, and does
-- not migrate any production data. Run against bobcat-dev only.
-- =========================================================

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

  select tc.task_id, coalesce(nullif(p.display_name, ''), p.email)
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
    coalesce(nullif(v_commenter, ''), 'Someone') || ' mentioned you in a comment',
    null,
    'task',
    v_task_id
  );

  return new;
end;
$$;

revoke execute on function public.notify_comment_mention() from public;
revoke execute on function public.notify_comment_mention() from anon, authenticated;

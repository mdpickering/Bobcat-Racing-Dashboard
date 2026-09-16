-- =========================================================
-- 0004_tasks.sql
-- Phase 6.2B: task database foundation — tasks, assignees,
-- task requests, comments (+ mentions), and attachment
-- metadata. Builds on 0001-0003. Does NOT touch
-- workspace_state or any legacy table, and does not migrate
-- any production data. Run against bobcat-dev only.
-- =========================================================

-- ---------------------------------------------------------
-- Enums
-- ---------------------------------------------------------
create type public.task_status as enum ('To Do', 'In Progress', 'Blocked', 'Review', 'Complete');
create type public.task_priority as enum ('Critical', 'High', 'Medium', 'Low');
create type public.task_assignee_role as enum ('primary', 'co_owner');
create type public.task_request_status as enum ('pending', 'approved', 'declined');

-- ---------------------------------------------------------
-- tasks
-- primary_owner_id is intentionally NOT settable by any
-- grant, on insert or update — it is a denormalized cache,
-- kept in sync only by the sync_task_primary_owner trigger
-- on task_assignees below. This makes "assign yourself owner
-- by changing a foreign key" structurally impossible: there
-- is no foreign key on this table anyone is ever granted to
-- write for that purpose.
-- ---------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  subsystem_id text not null references public.subsystems(id) on delete restrict,
  category_id uuid references public.subsystem_categories(id) on delete set null,
  primary_owner_id uuid references public.profiles(id) on delete set null,
  priority public.task_priority not null default 'Medium',
  status public.task_status not null default 'To Do',
  deadline timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legacy_id text,
  legacy_assignee_raw text,
  constraint tasks_legacy_id_key unique (legacy_id)
);

create index tasks_subsystem_id_idx on public.tasks (subsystem_id);
create index tasks_primary_owner_id_idx on public.tasks (primary_owner_id);
create index tasks_deadline_idx on public.tasks (deadline);
create index tasks_status_idx on public.tasks (status);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- task_assignees
-- Composite PK: a user can only be assigned to a given task
-- once. A partial unique index guarantees at most one
-- 'primary' assignee per task.
-- ---------------------------------------------------------
create table public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.task_assignee_role not null default 'co_owner',
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index task_assignees_user_id_idx on public.task_assignees (user_id);
create unique index task_assignees_one_primary_idx on public.task_assignees (task_id) where role = 'primary';

-- ---------------------------------------------------------
-- task_requests
-- A member-submitted proposal for work. Approving a request
-- does NOT auto-create a task in this migration — only the
-- conversion relationship (converted_task_id) is supported.
-- ---------------------------------------------------------
create table public.task_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete restrict,
  legacy_requester_raw text,
  subsystem_id text not null references public.subsystems(id) on delete restrict,
  title text not null,
  description text,
  status public.task_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  converted_task_id uuid references public.tasks(id) on delete set null,
  constraint task_requests_converted_requires_approved
    check (converted_task_id is null or status = 'approved')
);

create index task_requests_subsystem_status_idx on public.task_requests (subsystem_id, status);
create index task_requests_status_idx on public.task_requests (status);
create index task_requests_requester_id_idx on public.task_requests (requester_id);

-- ---------------------------------------------------------
-- task_comments
-- Task activity, not a chat system: no editing history beyond
-- updated_at, no delete grant (see grants section).
-- ---------------------------------------------------------
create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  comment text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index task_comments_task_id_idx on public.task_comments (task_id);

create trigger task_comments_set_updated_at
  before update on public.task_comments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- comment_mentions
-- Normalized @mention records. Not a messaging system — no
-- notification delivery, just "who was mentioned in what."
-- ---------------------------------------------------------
create table public.comment_mentions (
  comment_id uuid not null references public.task_comments(id) on delete cascade,
  mentioned_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, mentioned_profile_id)
);

create index comment_mentions_mentioned_profile_idx on public.comment_mentions (mentioned_profile_id);

-- ---------------------------------------------------------
-- task_attachments
-- Metadata only. The file itself lives in Supabase Storage;
-- storage_path is the pointer to it. No binary data here.
-- ---------------------------------------------------------
create table public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  file_name text not null,
  storage_path text not null,
  file_size bigint not null check (file_size >= 0),
  mime_type text,
  created_at timestamptz not null default now(),
  constraint task_attachments_storage_path_key unique (storage_path)
);

create index task_attachments_task_id_idx on public.task_attachments (task_id);

-- ---------------------------------------------------------
-- Helper function for RLS: "can the caller see/act on this
-- task at all" — reused by task_comments and task_attachments
-- so their access rules never drift out of sync with tasks'
-- own visibility rules. SECURITY DEFINER so it can read tasks
-- and task_assignees without being subject to (or recursing
-- into) their own RLS; only ever returns a boolean.
-- ---------------------------------------------------------
create or replace function public.can_access_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task_id
      and (
        public.is_cto_or_admin()
        or public.is_subsystem_lead(t.subsystem_id)
        or (public.is_approved() and public.is_subsystem_member(t.subsystem_id))
        or t.primary_owner_id = auth.uid()
        or exists (
          select 1 from public.task_assignees ta
          where ta.task_id = t.id and ta.user_id = auth.uid()
        )
      )
  );
$$;

-- Learned from 0003: revoke from the actual roles, not PUBLIC —
-- Supabase's default ALTER DEFAULT PRIVILEGES grants EXECUTE to
-- anon and authenticated explicitly at function-creation time.
revoke execute on function public.can_access_task(uuid) from anon, authenticated;
grant execute on function public.can_access_task(uuid) to authenticated;

-- ---------------------------------------------------------
-- tasks: before-write trigger.
-- INSERT: forces created_by to the caller, ignores any
-- client-supplied primary_owner_id (defense in depth — it is
-- not grantable anyway), derives completed_at from status.
-- UPDATE: created_by is immutable; completed_at is re-derived
-- from the status transition, never trusted from the client;
-- non-admin, non-lead-of-this-subsystem callers (i.e. mere
-- assignees, per the tasks_update policy below) may only
-- change status — every other field is silently reverted to
-- its prior value; even the subsystem's own lead may not move
-- a task into a different subsystem (that crosses two
-- subsystems' scope, so it's cto/admin-only).
-- Both branches also validate category_id belongs to the
-- task's subsystem_id.
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
        new.primary_owner_id := old.primary_owner_id;
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

create trigger tasks_before_write
  before insert or update on public.tasks
  for each row execute function public.tasks_before_write();

-- ---------------------------------------------------------
-- task_assignees: keep tasks.primary_owner_id in sync.
-- SECURITY DEFINER because it writes to tasks.primary_owner_id,
-- a column no caller (including cto/admin) is ever granted to
-- write directly — this trigger is the only path that can.
-- ---------------------------------------------------------
create or replace function public.sync_task_primary_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

create trigger task_assignees_sync_primary_owner
  after insert or update or delete on public.task_assignees
  for each row execute function public.sync_task_primary_owner();

-- ---------------------------------------------------------
-- task_requests: lock down submitter-controlled fields on
-- insert (mirrors the member_applications pattern from 0003),
-- and validate converted_task_id belongs to the same subsystem
-- on review update (a composite FK can't express this without
-- conflicting with subsystem_id's NOT NULL constraint on
-- ON DELETE SET NULL, so a trigger does it instead).
-- ---------------------------------------------------------
create or replace function public.set_task_request_defaults()
returns trigger
language plpgsql
as $$
begin
  new.requester_id := auth.uid();
  new.status := 'pending';
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.converted_task_id := null;
  return new;
end;
$$;

create trigger task_requests_set_defaults
  before insert on public.task_requests
  for each row execute function public.set_task_request_defaults();

create or replace function public.task_requests_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.converted_task_id is not null and not exists (
    select 1 from public.tasks t
    where t.id = new.converted_task_id and t.subsystem_id = new.subsystem_id
  ) then
    raise exception 'converted_task_id % does not belong to subsystem %', new.converted_task_id, new.subsystem_id;
  end if;
  return new;
end;
$$;

create trigger task_requests_before_update
  before update on public.task_requests
  for each row execute function public.task_requests_before_update();

-- ---------------------------------------------------------
-- task_comments / task_attachments: lock author/uploader to
-- the caller, same pattern as task_requests.requester_id.
-- ---------------------------------------------------------
create or replace function public.set_task_comment_author()
returns trigger
language plpgsql
as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$;

create trigger task_comments_set_author
  before insert on public.task_comments
  for each row execute function public.set_task_comment_author();

create or replace function public.set_task_attachment_uploader()
returns trigger
language plpgsql
as $$
begin
  new.uploaded_by := auth.uid();
  return new;
end;
$$;

create trigger task_attachments_set_uploader
  before insert on public.task_attachments
  for each row execute function public.set_task_attachment_uploader();

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.task_requests enable row level security;
alter table public.task_comments enable row level security;
alter table public.comment_mentions enable row level security;
alter table public.task_attachments enable row level security;

-- tasks ---------------------------------------------------------
create policy tasks_select
  on public.tasks
  for select
  to authenticated
  using (
    public.is_cto_or_admin()
    or public.is_subsystem_lead(subsystem_id)
    or (public.is_approved() and public.is_subsystem_member(subsystem_id))
    or primary_owner_id = auth.uid()
    or exists (
      select 1 from public.task_assignees ta
      where ta.task_id = tasks.id and ta.user_id = auth.uid()
    )
  );

create policy tasks_insert
  on public.tasks
  for insert
  to authenticated
  with check (
    public.is_cto_or_admin()
    or public.is_subsystem_lead(subsystem_id)
  );

-- One combined UPDATE policy governs who may attempt an update
-- at all; tasks_before_write (above) is what narrows WHAT they
-- can actually change once they're in — RLS alone can't express
-- "assignees may change only status" since it can't compare old
-- vs. new field-by-field, only a trigger can.
create policy tasks_update
  on public.tasks
  for update
  to authenticated
  using (
    public.is_cto_or_admin()
    or public.is_subsystem_lead(subsystem_id)
    or primary_owner_id = auth.uid()
    or exists (
      select 1 from public.task_assignees ta
      where ta.task_id = tasks.id and ta.user_id = auth.uid()
    )
  )
  with check (
    public.is_cto_or_admin()
    or public.is_subsystem_lead(subsystem_id)
    or primary_owner_id = auth.uid()
    or exists (
      select 1 from public.task_assignees ta
      where ta.task_id = tasks.id and ta.user_id = auth.uid()
    )
  );

-- task_assignees ---------------------------------------------------------
create policy task_assignees_select
  on public.task_assignees
  for select
  to authenticated
  using (public.can_access_task(task_id));

create policy task_assignees_insert
  on public.task_assignees
  for insert
  to authenticated
  with check (
    public.is_cto_or_admin()
    or exists (
      select 1 from public.tasks t
      where t.id = task_assignees.task_id and public.is_subsystem_lead(t.subsystem_id)
    )
  );

create policy task_assignees_update
  on public.task_assignees
  for update
  to authenticated
  using (
    public.is_cto_or_admin()
    or exists (
      select 1 from public.tasks t
      where t.id = task_assignees.task_id and public.is_subsystem_lead(t.subsystem_id)
    )
  )
  with check (
    public.is_cto_or_admin()
    or exists (
      select 1 from public.tasks t
      where t.id = task_assignees.task_id and public.is_subsystem_lead(t.subsystem_id)
    )
  );

create policy task_assignees_delete
  on public.task_assignees
  for delete
  to authenticated
  using (
    public.is_cto_or_admin()
    or exists (
      select 1 from public.tasks t
      where t.id = task_assignees.task_id and public.is_subsystem_lead(t.subsystem_id)
    )
  );

-- task_requests ---------------------------------------------------------
create policy task_requests_select
  on public.task_requests
  for select
  to authenticated
  using (
    public.is_cto_or_admin()
    or public.is_subsystem_lead(subsystem_id)
    or requester_id = auth.uid()
  );

create policy task_requests_insert
  on public.task_requests
  for insert
  to authenticated
  with check (
    public.is_approved()
    and requester_id = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and converted_task_id is null
  );

create policy task_requests_update_review
  on public.task_requests
  for update
  to authenticated
  using (
    public.is_cto_or_admin()
    or public.is_subsystem_lead(subsystem_id)
  )
  with check (
    public.is_cto_or_admin()
    or public.is_subsystem_lead(subsystem_id)
  );

-- task_comments ---------------------------------------------------------
create policy task_comments_select
  on public.task_comments
  for select
  to authenticated
  using (public.can_access_task(task_id));

create policy task_comments_insert
  on public.task_comments
  for insert
  to authenticated
  with check (public.can_access_task(task_id));

create policy task_comments_update_own
  on public.task_comments
  for update
  to authenticated
  using (
    (user_id = auth.uid() or public.is_cto_or_admin())
    and public.can_access_task(task_id)
  )
  with check (
    (user_id = auth.uid() or public.is_cto_or_admin())
    and public.can_access_task(task_id)
  );

-- comment_mentions ---------------------------------------------------------
create policy comment_mentions_select
  on public.comment_mentions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.task_comments c
      where c.id = comment_mentions.comment_id and public.can_access_task(c.task_id)
    )
  );

create policy comment_mentions_insert
  on public.comment_mentions
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.task_comments c
      where c.id = comment_mentions.comment_id and c.user_id = auth.uid()
    )
  );

create policy comment_mentions_delete
  on public.comment_mentions
  for delete
  to authenticated
  using (
    public.is_cto_or_admin()
    or exists (
      select 1 from public.task_comments c
      where c.id = comment_mentions.comment_id and c.user_id = auth.uid()
    )
  );

-- task_attachments ---------------------------------------------------------
create policy task_attachments_select
  on public.task_attachments
  for select
  to authenticated
  using (public.can_access_task(task_id));

create policy task_attachments_insert
  on public.task_attachments
  for insert
  to authenticated
  with check (public.can_access_task(task_id));

-- ---------------------------------------------------------
-- Column/table-level privileges.
-- Same defense-in-depth pattern as 0001-0003: these grants are
-- the coarse first gate (checked before RLS), RLS/triggers
-- above are the fine-grained real enforcement.
-- ---------------------------------------------------------
revoke all on public.tasks from authenticated, anon;
revoke all on public.task_assignees from authenticated, anon;
revoke all on public.task_requests from authenticated, anon;
revoke all on public.task_comments from authenticated, anon;
revoke all on public.comment_mentions from authenticated, anon;
revoke all on public.task_attachments from authenticated, anon;

grant select on public.tasks to authenticated;
grant insert (title, description, subsystem_id, category_id, priority, status, deadline)
  on public.tasks to authenticated;
grant update (title, description, subsystem_id, category_id, priority, status, deadline)
  on public.tasks to authenticated;
-- created_by, completed_at: fully trigger-derived, never grantable.
-- primary_owner_id: only ever set via task_assignees, never grantable.
-- legacy_id, legacy_assignee_raw: import-only, never grantable via the API.
-- No delete grant: tasks are archived via status, never deleted.

grant select on public.task_assignees to authenticated;
grant insert (task_id, user_id, role) on public.task_assignees to authenticated;
grant update (role) on public.task_assignees to authenticated;
grant delete on public.task_assignees to authenticated;
-- Same reasoning as subsystem_members: no active/archive flag on a
-- join table — removing an assignment is a real delete, gated by RLS.

grant select on public.task_requests to authenticated;
grant insert (legacy_requester_raw, subsystem_id, title, description)
  on public.task_requests to authenticated;
grant update (status, reviewed_by, reviewed_at, converted_task_id)
  on public.task_requests to authenticated;
-- requester_id: trigger-derived. title/description/subsystem_id become
-- immutable once submitted (no update grant on them at all).
-- legacy_requester_raw: import-only for insert, never updatable.
-- No delete grant: declined requests are archived via status, never deleted.

grant select on public.task_comments to authenticated;
grant insert (task_id, comment) on public.task_comments to authenticated;
grant update (comment) on public.task_comments to authenticated;
-- user_id: trigger-derived. No delete grant: this is an activity log,
-- not a chat system — comments are not removable via the API.

grant select on public.comment_mentions to authenticated;
grant insert (comment_id, mentioned_profile_id) on public.comment_mentions to authenticated;
grant delete on public.comment_mentions to authenticated;
-- No update grant: a mention is either present or not; edit by
-- deleting and re-inserting.

grant select on public.task_attachments to authenticated;
grant insert (task_id, file_name, storage_path, file_size, mime_type)
  on public.task_attachments to authenticated;
-- uploaded_by: trigger-derived. No update/delete grant: attachment
-- metadata is immutable once created; re-upload rather than edit.

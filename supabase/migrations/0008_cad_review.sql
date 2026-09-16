-- =========================================================
-- 0008_cad_review.sql
-- Phase 6.2D: CAD review database foundation — cad_reviews,
-- per-revision version history, and review comments. Builds
-- on 0001-0007 and reuses their security patterns exactly
-- (SECURITY DEFINER helpers with the full PUBLIC + anon/
-- authenticated EXECUTE revoke, trigger-derived audit fields,
-- silent-revert vs. hard-error field locking depending on
-- severity, archive-over-delete). Does NOT touch
-- workspace_state or any legacy table, and does not migrate
-- any production data. Run against bobcat-dev only.
-- =========================================================

-- ---------------------------------------------------------
-- Enum: the agreed CAD review workflow.
-- ---------------------------------------------------------
create type public.cad_review_status as enum (
  'Draft', 'Submitted for Review', 'Changes Requested', 'Approved', 'Approved for Manufacturing'
);

-- ---------------------------------------------------------
-- cad_reviews
-- submitted_by is trigger-derived (immutable after creation).
-- reviewer_id/reviewed_at are trigger-derived, stamped only the
-- first time a lead/cto/admin makes a review decision (mirrors
-- purchase_requests.reviewed_by). current_revision is
-- maintained solely by the version-insert trigger below — it
-- is not grantable to anyone directly, so it can never drift
-- from the actual version history.
-- ---------------------------------------------------------
create table public.cad_reviews (
  id uuid primary key default gen_random_uuid(),
  subsystem_id text not null references public.subsystems(id) on delete restrict,
  task_id uuid references public.tasks(id) on delete set null,
  title text not null,
  description text,
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  reviewer_id uuid references public.profiles(id) on delete set null,
  status public.cad_review_status not null default 'Draft',
  current_revision integer not null default 0,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legacy_id text,
  legacy_status_raw text,
  constraint cad_reviews_legacy_id_key unique (legacy_id)
);

create index cad_reviews_subsystem_id_idx on public.cad_reviews (subsystem_id);
create index cad_reviews_task_id_idx on public.cad_reviews (task_id);
create index cad_reviews_status_idx on public.cad_reviews (status);
create index cad_reviews_submitted_by_idx on public.cad_reviews (submitted_by);

create trigger cad_reviews_set_updated_at
  before update on public.cad_reviews
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- cad_review_versions
-- Append-only revision history: v1, v2, v3... Each revision
-- carries its own submitter, CAD link, drawing link, and notes.
-- revision_number is never client-supplied — it is computed by
-- the trigger below as (current max for this review) + 1, so it
-- can never collide or be spoofed to overwrite another revision.
-- Once created, a revision is immutable (no update/delete
-- grant) — history should not be editable after the fact.
-- ---------------------------------------------------------
create table public.cad_review_versions (
  id uuid primary key default gen_random_uuid(),
  cad_review_id uuid not null references public.cad_reviews(id) on delete cascade,
  revision_number integer not null,
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  external_cad_link text,
  drawing_link text,
  notes text,
  created_at timestamptz not null default now(),
  legacy_id text,
  constraint cad_review_versions_legacy_id_key unique (legacy_id),
  constraint cad_review_versions_review_revision_key unique (cad_review_id, revision_number)
);

create index cad_review_versions_cad_review_id_idx on public.cad_review_versions (cad_review_id);

-- ---------------------------------------------------------
-- cad_review_comments
-- Review discussion, same shape/philosophy as task_comments:
-- author-locked, editable only by its author (or cto/admin),
-- no delete grant.
-- ---------------------------------------------------------
create table public.cad_review_comments (
  id uuid primary key default gen_random_uuid(),
  cad_review_id uuid not null references public.cad_reviews(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  comment text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cad_review_comments_cad_review_id_idx on public.cad_review_comments (cad_review_id);

create trigger cad_review_comments_set_updated_at
  before update on public.cad_review_comments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Helper function for RLS: "can the caller see/act on this CAD
-- review at all" — reused by cad_review_versions and
-- cad_review_comments. SECURITY DEFINER so it can read
-- cad_reviews without being subject to (or recursing into) its
-- own RLS; only ever returns a boolean. Applying the full 0006
-- lesson from the start: EXECUTE revoked from PUBLIC (the plain
-- Postgres default on every new function) AND from anon,
-- authenticated by name (Supabase's separate default-privilege
-- layer) — both layers, not one.
-- ---------------------------------------------------------
create or replace function public.can_access_cad_review(p_cad_review_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cad_reviews cr
    where cr.id = p_cad_review_id
      and (
        public.is_cto_or_admin()
        or public.is_subsystem_lead(cr.subsystem_id)
        or (public.is_approved() and public.is_subsystem_member(cr.subsystem_id))
        or cr.submitted_by = auth.uid()
      )
  );
$$;

revoke execute on function public.can_access_cad_review(uuid) from public;
revoke execute on function public.can_access_cad_review(uuid) from anon, authenticated;
grant execute on function public.can_access_cad_review(uuid) to authenticated;

-- ---------------------------------------------------------
-- cad_reviews: before-write trigger.
-- INSERT: forces submitted_by to the caller; every review
-- starts as 'Draft' with current_revision 0 regardless of
-- client input; reviewer_id/reviewed_at start null.
-- UPDATE: submitted_by is immutable. 'Approved for
-- Manufacturing' is a hard CTO/Admin-only gate — even the
-- subsystem's own lead gets an error, not a silent revert,
-- because that is an explicit, narrower restriction than
-- ordinary review authority (mirrors purchase_requests'
-- Approved/Rejected gate). Below that: cto/admin or the
-- subsystem's lead may edit anything and make review decisions
-- (Changes Requested / Approved); anyone else reaching this row
-- only via submitted_by = auth.uid() may not move it to another
-- subsystem and may only leave status at Draft or move it to
-- Submitted for Review (submitting their own draft) — any other
-- status they attempt is silently reverted, same as tasks'
-- assignee field-lock. reviewer_id/reviewed_at are stamped once,
-- the first time a lead/cto/admin makes a review decision, and
-- left untouched afterward. current_revision is never accepted
-- from the client — only cad_review_versions_set_defaults may
-- change it. task_id, if set, must belong to the same subsystem.
-- ---------------------------------------------------------
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
    new.current_revision := old.current_revision;

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

create trigger cad_reviews_before_write
  before insert or update on public.cad_reviews
  for each row execute function public.cad_reviews_before_write();

-- ---------------------------------------------------------
-- cad_review_versions: computes revision_number server-side and
-- keeps cad_reviews.current_revision in sync. SECURITY DEFINER
-- because it writes to cad_reviews.current_revision, a column
-- no caller (including cto/admin) is ever granted to write
-- directly — mirrors sync_task_primary_owner exactly. Same full
-- PUBLIC + anon/authenticated EXECUTE revoke applied below.
-- ---------------------------------------------------------
create or replace function public.set_cad_review_version_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_rev integer;
begin
  new.submitted_by := auth.uid();

  select coalesce(max(revision_number), 0) + 1 into next_rev
  from public.cad_review_versions
  where cad_review_id = new.cad_review_id;
  new.revision_number := next_rev;

  update public.cad_reviews set current_revision = next_rev where id = new.cad_review_id;

  return new;
end;
$$;

revoke execute on function public.set_cad_review_version_defaults() from public;
revoke execute on function public.set_cad_review_version_defaults() from anon, authenticated;

create trigger cad_review_versions_set_defaults
  before insert on public.cad_review_versions
  for each row execute function public.set_cad_review_version_defaults();

-- ---------------------------------------------------------
-- cad_review_comments: lock author to the caller.
-- ---------------------------------------------------------
create or replace function public.set_cad_review_comment_author()
returns trigger
language plpgsql
as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$;

create trigger cad_review_comments_set_author
  before insert on public.cad_review_comments
  for each row execute function public.set_cad_review_comment_author();

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------
alter table public.cad_reviews enable row level security;
alter table public.cad_review_versions enable row level security;
alter table public.cad_review_comments enable row level security;

-- cad_reviews ---------------------------------------------------------
create policy cad_reviews_select
  on public.cad_reviews
  for select
  to authenticated
  using (
    public.is_cto_or_admin()
    or public.is_subsystem_lead(subsystem_id)
    or (public.is_approved() and public.is_subsystem_member(subsystem_id))
    or submitted_by = auth.uid()
  );

-- Any approved member of the subsystem can submit a CAD review
-- for it — unlike tasks (lead/cto-only creation), CAD review
-- submission is explicitly a member-level capability per the
-- agreed requirements ("approved members can submit CAD reviews").
create policy cad_reviews_insert
  on public.cad_reviews
  for insert
  to authenticated
  with check (
    public.is_cto_or_admin()
    or (public.is_approved() and public.is_subsystem_member(subsystem_id))
  );

-- Who may attempt an update at all; cad_reviews_before_write
-- above narrows what a mere submitter (vs. a lead/cto/admin) can
-- actually change, and hard-blocks Approved for Manufacturing
-- for anyone but cto/admin.
create policy cad_reviews_update
  on public.cad_reviews
  for update
  to authenticated
  using (
    public.is_cto_or_admin()
    or public.is_subsystem_lead(subsystem_id)
    or submitted_by = auth.uid()
  )
  with check (
    public.is_cto_or_admin()
    or public.is_subsystem_lead(subsystem_id)
    or submitted_by = auth.uid()
  );

-- cad_review_versions ---------------------------------------------------------
create policy cad_review_versions_select
  on public.cad_review_versions
  for select
  to authenticated
  using (public.can_access_cad_review(cad_review_id));

-- A new revision may be added by cto/admin, the subsystem's
-- lead, or the review's own original submitter (resubmitting
-- after Changes Requested).
create policy cad_review_versions_insert
  on public.cad_review_versions
  for insert
  to authenticated
  with check (
    public.is_cto_or_admin()
    or exists (
      select 1 from public.cad_reviews cr
      where cr.id = cad_review_versions.cad_review_id
        and (public.is_subsystem_lead(cr.subsystem_id) or cr.submitted_by = auth.uid())
    )
  );

-- cad_review_comments ---------------------------------------------------------
create policy cad_review_comments_select
  on public.cad_review_comments
  for select
  to authenticated
  using (public.can_access_cad_review(cad_review_id));

create policy cad_review_comments_insert
  on public.cad_review_comments
  for insert
  to authenticated
  with check (public.can_access_cad_review(cad_review_id));

create policy cad_review_comments_update_own
  on public.cad_review_comments
  for update
  to authenticated
  using (
    (user_id = auth.uid() or public.is_cto_or_admin())
    and public.can_access_cad_review(cad_review_id)
  )
  with check (
    (user_id = auth.uid() or public.is_cto_or_admin())
    and public.can_access_cad_review(cad_review_id)
  );

-- ---------------------------------------------------------
-- Column/table-level privileges.
-- Same defense-in-depth pattern as 0001-0007: these grants are
-- the coarse first gate (checked before RLS), RLS/triggers
-- above are the fine-grained real enforcement.
-- ---------------------------------------------------------
revoke all on public.cad_reviews from authenticated, anon;
revoke all on public.cad_review_versions from authenticated, anon;
revoke all on public.cad_review_comments from authenticated, anon;

grant select on public.cad_reviews to authenticated;
grant insert (subsystem_id, task_id, title, description) on public.cad_reviews to authenticated;
grant update (title, description, task_id, subsystem_id, status) on public.cad_reviews to authenticated;
-- submitted_by, reviewer_id, reviewed_at, current_revision: fully
-- trigger-derived, never grantable.
-- legacy_id, legacy_status_raw: import-only, never grantable via the API.
-- No delete grant.

grant select on public.cad_review_versions to authenticated;
grant insert (cad_review_id, external_cad_link, drawing_link, notes)
  on public.cad_review_versions to authenticated;
-- submitted_by, revision_number: trigger-derived, never grantable.
-- legacy_id: import-only, never grantable via the API.
-- No update/delete grant: revision history is immutable once recorded.

grant select on public.cad_review_comments to authenticated;
grant insert (cad_review_id, comment) on public.cad_review_comments to authenticated;
grant update (comment) on public.cad_review_comments to authenticated;
-- user_id: trigger-derived. No delete grant, same as task_comments.

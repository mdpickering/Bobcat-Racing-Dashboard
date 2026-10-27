-- =========================================================
-- 0045_bom_costs_and_review.sql
-- Builds on 0044 (bom_lines). Two changes:
--
-- 1. MONEY IS HIDDEN FROM MOST PEOPLE, IN THE DATABASE. Prices move out of bom_lines into
--    bom_line_costs, which only Business members and cto/admin can read (the row-level
--    security on that table is the gate, not the page). Everyone else still reads the
--    parts, vendors, quantities and seasons from bom_lines; for them the cost simply is not
--    there. Existing prices are copied across before the old columns are dropped.
--
-- 2. THE REVIEW QUEUE. Lines the spreadsheet flagged ("which quote was ordered?", "is this a
--    repeat order?", "assign a subsystem"...) can now be worked through by cto/admin: mark a
--    line checked or ignored, with a note, and correct its subsystem, season, vendor, part
--    number or type. Who reviewed and when is stamped by the database (never client-supplied)
--    and every change is written to the existing audit_logs table.
--
-- Changes NO other table, policy, function or grant.
--
-- Who can do what
--   read lines            any approved user (unchanged from 0044)
--   read costs            Business members and cto/admin (is_business_member / is_cto_or_admin)
--   edit / review lines   cto/admin only; only the columns granted below
--   nobody inserts or deletes through the API
-- =========================================================

-- ---------------------------------------------------------
-- 1. Costs
-- ---------------------------------------------------------
create or replace function public.can_view_bom_costs()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_business_member() or public.is_cto_or_admin();
$$;

revoke execute on function public.can_view_bom_costs() from public;
revoke execute on function public.can_view_bom_costs() from anon, authenticated;
grant execute on function public.can_view_bom_costs() to authenticated;

create table public.bom_line_costs (
  line_id uuid primary key references public.bom_lines(id) on delete cascade,
  unit_cost numeric(10, 2) check (unit_cost is null or unit_cost >= 0),
  total_cost numeric(12, 2) check (total_cost is null or total_cost >= 0)
);

insert into public.bom_line_costs (line_id, unit_cost, total_cost)
select id, unit_cost, total_cost from public.bom_lines where unit_cost is not null or total_cost is not null;

alter table public.bom_lines drop column unit_cost, drop column total_cost;

alter table public.bom_line_costs enable row level security;
create policy bom_line_costs_select on public.bom_line_costs for select to authenticated using (public.can_view_bom_costs());
revoke all on public.bom_line_costs from anon, authenticated;
grant select on public.bom_line_costs to authenticated;

-- ---------------------------------------------------------
-- 2. Review
-- ---------------------------------------------------------
alter table public.bom_lines
  add column review_status text not null default 'open' check (review_status in ('open', 'checked', 'ignored')),
  add column review_note text check (review_note is null or char_length(review_note) <= 1000),
  add column reviewed_by uuid references public.profiles(id) on delete set null,
  add column reviewed_at timestamptz,
  add column updated_at timestamptz not null default now();

alter table public.bom_lines
  add constraint bom_lines_season_shape check (season ~ '^(20[0-9]{2}-[0-9]{2}|Undated)$');

create index bom_lines_review_status_idx on public.bom_lines (review_status);

create or replace function public.bom_lines_before_update()
returns trigger
language plpgsql
as $$
begin
  new.subsystem := btrim(new.subsystem);
  new.season := btrim(new.season);
  new.vendor := nullif(btrim(new.vendor), '');
  new.part_number := nullif(btrim(new.part_number), '');
  new.review_note := nullif(btrim(new.review_note), '');
  -- everything the API cannot set stays exactly as it was
  new.id := old.id;
  new.source_key := old.source_key;
  new.created_at := old.created_at;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  -- who reviewed and when: derived here from the status change, never taken from the caller
  if new.review_status is distinct from old.review_status then
    if new.review_status = 'open' then
      new.reviewed_by := null;
      new.reviewed_at := null;
    else
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger bom_lines_before_update before update on public.bom_lines
  for each row execute function public.bom_lines_before_update();

-- Audit: one row per real change with just the fields that changed (the same shape as the parts catalog's, 0037).
create or replace function public.bom_lines_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  k text;
begin
  for k in select jsonb_object_keys(v_new) loop
    if k not in ('updated_at', 'reviewed_at') and (v_new -> k) is distinct from (v_old -> k) then
      v_before := v_before || jsonb_build_object(k, v_old -> k);
      v_after := v_after || jsonb_build_object(k, v_new -> k);
    end if;
  end loop;
  if v_after = '{}'::jsonb then
    return new;
  end if;
  insert into public.audit_logs (user_id, action, entity_type, entity_id, before, after)
  values (
    auth.uid(),
    case when v_after ? 'review_status' then 'bom_line.review_' || (v_new ->> 'review_status') else 'bom_line.updated' end,
    'bom_line',
    new.id,
    v_before,
    v_after
  );
  return new;
end;
$$;

revoke execute on function public.bom_lines_audit() from public;
revoke execute on function public.bom_lines_audit() from anon, authenticated;

create trigger bom_lines_audit after update on public.bom_lines
  for each row execute function public.bom_lines_audit();

create policy bom_lines_update on public.bom_lines for update to authenticated
  using (public.is_cto_or_admin()) with check (public.is_cto_or_admin());

-- Only these columns can be changed through the API.
grant update (subsystem, season, vendor, part_number, record_type, review_status, review_note) on public.bom_lines to authenticated;

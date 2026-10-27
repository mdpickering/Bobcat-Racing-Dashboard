-- =========================================================
-- 0044_bom_history.sql
-- The team's Master BOM (Baja_Master_BOM_2022-2026.xlsx) as a read-only reference
-- table behind the "BOM Lookup" page: what each season actually bought or planned,
-- where from, for how much, and which lines are quotes or plans rather than orders.
--
-- This is deliberately SEPARATE from the curated parts catalog (0037): the workbook is
-- purchase history (the same part appears once per order, quotes and plans sit beside
-- real orders, 24 lines have no part number), so loading it into `parts` would
-- pollute a catalog that is meant to have one clean row per part. Promoting a BOM line
-- into the catalog stays a deliberate, manual act.
--
-- Changes NO existing table, policy, function or grant.
--
-- Who can do what
--   read   any approved user (the same rule as the parts catalog and purchasing)
--   write  nobody through the API: there is no insert/update/delete grant and no
--          write policy. The data is loaded by supabase/data/bom_history_2022_2026.sql,
--          run in the SQL editor, which is idempotent (it upserts on source_key), so
--          re-running it after the spreadsheet is corrected is safe.
-- =========================================================

create table public.bom_lines (
  id uuid primary key default gen_random_uuid(),
  -- stable identity of the spreadsheet row, so the data file can be re-run without duplicating anything
  source_key text not null,
  -- the workbook's own labels; free text on purpose (they are not the live subsystems.id keys)
  subsystem text not null check (btrim(subsystem) <> '' and char_length(subsystem) <= 100),
  sub_assembly text check (sub_assembly is null or char_length(sub_assembly) <= 150),
  -- '2022-23' .. '2025-26', or 'Undated'
  season text not null check (btrim(season) <> '' and char_length(season) <= 20),
  ordered_on date,
  item text not null check (btrim(item) <> '' and char_length(item) <= 400),
  part_number text check (part_number is null or char_length(part_number) <= 100),
  vendor text check (vendor is null or char_length(vendor) <= 150),
  unit_cost numeric(10, 2) check (unit_cost is null or unit_cost >= 0),
  quantity integer check (quantity is null or quantity > 0),
  total_cost numeric(12, 2) check (total_cost is null or total_cost >= 0),
  link text check (link is null or public.is_valid_http_url(link)),
  original_link text check (original_link is null or public.is_valid_http_url(original_link)),
  -- Purchase list = an order sheet (does not prove arrival); Quote = no record it was ordered;
  -- the other three are plans / lists, not purchases
  record_type text not null check (record_type in ('Purchase list', 'Quote', 'Planned BOM', 'Team master BOM', 'CAD part list')),
  members text check (members is null or char_length(members) <= 150),
  notes text check (notes is null or char_length(notes) <= 1000),
  source_files text check (source_files is null or char_length(source_files) <= 500),
  subsystem_basis text check (subsystem_basis is null or char_length(subsystem_basis) <= 100),
  -- why a human should double-check this line (blank when nothing is open)
  review_flag text check (review_flag is null or char_length(review_flag) <= 1000),
  -- the workbook's row order
  sort_order integer not null,
  created_at timestamptz not null default now(),
  constraint bom_lines_source_key_unique unique (source_key)
);

create index bom_lines_subsystem_idx on public.bom_lines (subsystem);
create index bom_lines_season_idx on public.bom_lines (season);
create index bom_lines_record_type_idx on public.bom_lines (record_type);
create index bom_lines_vendor_idx on public.bom_lines (vendor);
create index bom_lines_part_number_idx on public.bom_lines (lower(part_number));

alter table public.bom_lines enable row level security;

create policy bom_lines_select on public.bom_lines for select to authenticated using (public.is_approved());

-- Read only: the only privilege handed to the API roles is SELECT.
revoke all on public.bom_lines from anon, authenticated;
grant select on public.bom_lines to authenticated;

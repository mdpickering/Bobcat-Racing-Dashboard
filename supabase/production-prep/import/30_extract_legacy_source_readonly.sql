-- =========================================================
-- 30_extract_legacy_source_readonly.sql
-- Phase 6.8: READ-ONLY extraction of the ACTUAL legacy data needed to rebuild it in bobcat-dev. NOT a migration.
-- ONE single SELECT statement. It reads public.workspace_state, public.tasks, public.orders and public.subteams and
-- returns them as one JSON value. It writes nothing, deletes nothing and touches nothing.
--
-- RUN IT ON: the OLD LIVE (legacy) Supabase project ONLY.  NEVER on bobcat-dev (bobcat-dev has none of these tables).
-- SAVE THE SINGLE JSON CELL AS: supabase/production-prep/results/prod_30_source_export.json   (git-ignored)
--
-- WHAT IT RETURNS (everything the import needs; unlike scripts 02/03 it DOES include titles, notes, names and values):
--   workspace_state : the full document (id, updated_at, taxonomy, tasks, orders, timeline_columns, recurring_events,
--                     timeline_milestones)  -- with the plaintext lead PINs REMOVED (see below)
--   tasks           : every row of the legacy relational public.tasks table (all columns)
--   orders          : every row of public.orders (all columns)
--   subteams        : every row of public.subteams (all columns)
--   fingerprints    : md5 hashes computed on the ORIGINAL data with the same formulas as script 03, so the export can be
--                     checked against the baseline recorded in PRODUCTION_PLAN.md (detects legacy data that changed since)
--
-- SECURITY: taxonomy[].leadPin (plaintext 4-digit PINs) is stripped INSIDE this query with the jsonb "-" operator, so the PINs
-- never leave the database, never reach the export file, chat or the import SQL. Only the COUNT of removed PINs is reported.
-- The export contains people's names (assignees, leads, members, requester) because the import must preserve them as raw legacy
-- values; keep the file local (results/ is git-ignored).
--
-- Expected size: roughly 20-40 KB of JSON (a worst-case synthetic copy built from the real field-length maxima measured 28.5 KB
-- minified / 35 KB pretty-printed): 49 + 30 tasks, 25 categories, 15 timeline columns, 2 orders, 1 subteam.
-- =========================================================
with ws as (select * from public.workspace_state limit 1)
select jsonb_build_object(

  'export_meta', jsonb_build_object(
    'format', 'bobcat-legacy-export-v1',
    'exported_at', now(),
    'database', current_database(),
    'lead_pins_removed_from_taxonomy', (select count(*) from ws, jsonb_array_elements(coalesce(ws.taxonomy, '[]'::jsonb)) e where e ? 'leadPin')
  ),

  'row_counts', jsonb_build_object(
    'workspace_state_rows', (select count(*) from public.workspace_state),
    'tasks', (select count(*) from public.tasks),
    'orders', (select count(*) from public.orders),
    'subteams', (select count(*) from public.subteams)
  ),

  -- same formulas as 03_reconcile_legacy_data_readonly.sql, on the ORIGINAL (unstripped) data
  'fingerprints', jsonb_build_object(
    'ws_tasks', (select md5(tasks::text) from ws),
    'ws_taxonomy', (select md5(taxonomy::text) from ws),
    'ws_orders', (select md5(orders::text) from ws),
    'ws_timeline_columns', (select md5(timeline_columns::text) from ws),
    'ws_recurring_events', (select md5(recurring_events::text) from ws),
    'ws_timeline_milestones', (select md5(timeline_milestones::text) from ws),
    'ws_updated_at', (select updated_at from ws),
    'tbl_tasks', (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from public.tasks t),
    'tbl_orders', (select md5(coalesce(string_agg(o::text, '|' order by o.id), '')) from public.orders o),
    'tbl_subteams', (select md5(coalesce(string_agg(s::text, '|' order by s.id), '')) from public.subteams s)
  ),

  'workspace_state', (select jsonb_build_object(
      'id', ws.id,
      'updated_at', ws.updated_at,
      -- array order is preserved; the plaintext lead PIN is removed from every subsystem object
      'taxonomy', (select coalesce(jsonb_agg(e - 'leadPin' order by ord), '[]'::jsonb)
                   from jsonb_array_elements(coalesce(ws.taxonomy, '[]'::jsonb)) with ordinality as t(e, ord)),
      'tasks', coalesce(ws.tasks, '[]'::jsonb),
      'orders', coalesce(ws.orders, '[]'::jsonb),
      'timeline_columns', coalesce(ws.timeline_columns, '[]'::jsonb),
      'recurring_events', coalesce(ws.recurring_events, '[]'::jsonb),
      'timeline_milestones', coalesce(ws.timeline_milestones, '{}'::jsonb)
    ) from ws),

  'tasks',    (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.tasks t),
  'orders',   (select coalesce(jsonb_agg(to_jsonb(o) order by o.id), '[]'::jsonb) from public.orders o),
  'subteams', (select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb) from public.subteams s)

) as source_export;

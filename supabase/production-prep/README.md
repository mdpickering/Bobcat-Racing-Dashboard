# Phase 6.7 — production schema preparation (READ-ONLY tooling)

Nothing in this folder is a migration and nothing here changes any database.
The real migrations stay in `supabase/migrations/` (0001–0021) and are applied
by hand, by a human, in the Supabase SQL Editor — never automatically.

## Rules
- Never touch or modify `workspace_state`; never migrate production data in this phase.
- No service-role key, DB password or `SUPABASE_DB_URL` is ever needed or used.
- `01_…` reads only system catalogs (+ counts). `02_…` SELECTs `workspace_state` to
  return its *shape* only (no names / titles / e-mails). Both are single SELECT statements.

## Runbook (inspection)
1. **Production SQL Editor** → paste `01_inspect_schema_readonly.sql` → Run → copy the single
   JSON cell → save as `results/prod_01_inventory.json`.
2. **bobcat-dev SQL Editor** → same file → save as `results/dev_01_inventory.json`.
3. (After reviewing step 1's `tables` section) **Production** → `02_profile_workspace_state_readonly.sql`
   → save as `results/prod_02_workspace_state_shape.json`.
4. Compare: `node tools/compare_inventory.mjs results/prod_01_inventory.json results/dev_01_inventory.json prod dev`
   - "only in dev" → must be CREATED in production
   - "only in prod" → legacy/foreign objects (never dropped or renamed)
   - "differs" → CONFLICT / ALTER candidates

`results/` is git-ignored.

## Tools
- `tools/compare_inventory.mjs` — diffs two inventories (no network, no DB).
- `tools/rehearse_migrations.mjs` — applies 0001–0021 to a clean in-memory scratch Postgres
  (PGlite) with a Supabase-shaped stub, to prove ordering and produce a reference inventory.

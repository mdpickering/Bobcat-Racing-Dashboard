# Phase 6.7 — production schema preparation

**Start with [`PRODUCTION_PLAN.md`](PRODUCTION_PLAN.md)** — the complete plan (inventory, diff, migration order,
data mapping, rollback, risks, blockers).

Nothing in this folder is a migration and nothing here is applied automatically. The real migrations stay in
`supabase/migrations/` (0001–0021) and are applied by a human, one file at a time, in the Supabase SQL Editor.

## Rules
- Never modify `workspace_state` or any legacy table; never migrate production data in this phase.
- No service-role key, DB password or `SUPABASE_DB_URL` is ever needed or used.
- The numbered scripts are single SELECT statements. `01`/`04` read catalogs only; `02`/`03` SELECT the legacy
  tables but return only shapes, ids, counts, enum-like values and hashes — never names, titles, e-mails, vendors or PINs.

## Read-only scripts (run in the SQL Editor, save the single JSON cell to `results/`, which is git-ignored)
| Script | Run on | Save as | Purpose |
|---|---|---|---|
| `01_inspect_schema_readonly.sql` | production **and** bobcat-dev | `results/prod_01_inventory.json`, `results/dev_01_inventory.json` | full catalog inventory |
| `02_profile_workspace_state_readonly.sql` | production | `results/prod_02_workspace_state_shape.json` | shape of `workspace_state` |
| `03_reconcile_legacy_data_readonly.sql` | production | `results/prod_03_reconcile.json` | tasks source-of-truth, order statuses, timeline values, rule checks, drift fingerprints |
| `04_preflight_checks_readonly.sql` | the **target** project, right before applying 0001 | (read the result) | must return `all_clear: true` |
| `05_tasks_side_by_side_readonly.sql` | production (before the import, for decisions D3/D4) | `results/prod_05_tasks_side_by_side.json` | row-by-row report of the two divergent task datasets + unknown subsystem ids. Returns task titles (needed to compare) but no assignee names/notes/vendors; keep the file local. |

`node tools/check_results.mjs` validates the saved result files (empty / placeholder / SQL-error / wrong-query / wrong-project);
`--wait <seconds>` polls until all four are ready.

## Other folders
- `prestep/00_rename_legacy_tasks.sql` — **Path B only, needs explicit approval** (renames legacy `public.tasks`).
- `rollback/99_rollback_v2_schema.sql` — destructive, explicit-name removal of everything 0001–0021 create.
  `rollback/00_undo_rename_legacy_tasks.sql` — undoes the Path B rename.
- `tools/compare_inventory.mjs A.json B.json` — diff two inventories (create / conflict / legacy).
- `tools/rehearse_migrations.mjs` — apply 0001–0021 to a clean in-memory Postgres (PGlite) with a Supabase stub.
- `tools/rehearse_production_replica.mjs` — same, against a replica of the REAL production shape: proves the
  `tasks` collision, the pre-step, the rollback and per-migration object counts.
  Setup (outside the project): `mkdir %TEMP%\pg && cd %TEMP%\pg && npm init -y && npm i @electric-sql/pglite`,
  then `node <repo>\supabase\production-prep\tools\<tool>.mjs <repo>`.

`04_…` is generated from the reference inventory of 0001–0021; regenerate it if a migration is added.

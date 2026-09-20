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
| `04_preflight_checks_readonly.sql` | a **new/empty** project, right before applying 0001 (**not applicable to bobcat-dev**, which already has 0001–0021) | (read the result) | must return `all_clear: true` on an empty project |
| `05_tasks_side_by_side_readonly.sql` | production (before the import, for decisions D3/D4) | `results/prod_05_tasks_side_by_side.json` | row-by-row report of the two divergent task datasets + unknown subsystem ids. Returns task titles (needed to compare) but no assignee names/notes/vendors; keep the file local. |
| `06_inventory_dev_data_readonly.sql` | **bobcat-dev only** (the new live DB, before cleanup) | `results/dev_06_data_inventory.json` (optional file) | auth users + every application table's test data, exact row counts, storage objects. Returns e-mails and titles (needed to classify test data) — keep it local. |

| `07_child_rows_actors_readonly.sql` | **bobcat-dev only** (supplement to 06) | `results/dev_07_child_actors.json` (optional file) | row-by-row actors for the child tables 06 only counted (purchase history/items, CAD versions/comments, comment mentions, reviewer columns). Must be clean before the cleanup list is approved. |

`node tools/classify_dev_cleanup.mjs` turns the 06 inventory into the DELETE / KEEP / HOLD approval list (`results/dev_cleanup_classification.{json,md}`, git-ignored — contains e-mails/titles).

**Target environment (amended 2026-09-19): bobcat-dev is being promoted to the live database; the old project is a read-only source.**
See `PRODUCTION_PLAN.md` §3 and §15. **Nothing here deletes or imports anything.** `tools/rehearse_cleanup.mjs` rehearses the test-data cleanup on a scratch
Postgres only. `rollback/99_rollback_v2_schema.sql` must never be run on bobcat-dev (it refuses without an explicit confirmation setting).

`node tools/check_results.mjs` validates the saved result files (empty / placeholder / SQL-error / wrong-query / wrong-project);
`--wait <seconds>` polls until all four are ready.

## Cleanup SQL for bobcat-dev (generated, **not executed**)
`cleanup/` holds the owner-approved test-data cleanup: `08a_cleanup_DRY_RUN.sql` (ends in ROLLBACK), `08b_cleanup_EXECUTE.sql` (ends in COMMIT), `09_DASHBOARD_STEPS.md`
(2 storage files + 3 test auth users) and `10_post_dashboard_verify_readonly.sql`. Regenerate with `node tools/generate_cleanup_sql.mjs`; rehearse with `tools/rehearse_cleanup_sql.mjs`.
Run order: 08a → 08b → Dashboard steps → 10. **Never run any of it on the old legacy project** (08 refuses if `workspace_state`/`orders`/`subteams` exist). See `PRODUCTION_PLAN.md` §15.11.

## Data extraction and import (Phase 6.8 preparation — nothing executed)
`import/30_extract_legacy_source_readonly.sql` — run on the **OLD** project only (read-only; strips the plaintext lead PINs inside the query) → save as `results/prod_30_source_export.json`.
`node tools/validate_source_export.mjs` validates it (blocks on PINs / missing sections; reports drift vs the recorded baseline).
`node tools/generate_import_sql.mjs` builds `results/import/40a_import_DRY_RUN.sql` (ends in ROLLBACK) and `40b_import_EXECUTE.sql` (ends in COMMIT) from the validated export via `import/40_import_TEMPLATE_DO_NOT_RUN.sql` (**a template — never paste it; it stops with a clear message if run**; the ONLY files to run are the two generated ones in `results/import/`).
Before pasting anything, run `node tools/check_generated_import_sql.mjs` — 50 static checks (no unresolved template marker of any kind, 40a=ROLLBACK, 40b=COMMIT, payload identical to the validated export, no PINs, no writes to profiles/auth, expected counts)
(git-ignored output: it embeds the legacy data). Run them on **bobcat-dev only**: 40a → read the result → 40b → `import/41_post_import_verify_readonly.sql`.
`tools/rehearse_import.mjs` (+ `tools/synthetic_legacy.mjs`) rehearses the whole pipeline on a scratch Postgres with synthetic, PIN-bearing legacy data. See `PRODUCTION_PLAN.md` §16.

## Other folders
- `prestep/00_rename_legacy_tasks.sql` — **NOT USED**: bobcat-dev has no legacy `tasks` table and the old project is never modified, so nothing is renamed.
  Kept only as the record of the rejected Path B.
- `rollback/99_rollback_v2_schema.sql` — destructive, explicit-name removal of everything 0001–0021 create.
  `rollback/00_undo_rename_legacy_tasks.sql` — undoes the Path B rename.
- `tools/compare_inventory.mjs A.json B.json` — diff two inventories (create / conflict / legacy).
- `tools/rehearse_migrations.mjs` — apply 0001–0021 to a clean in-memory Postgres (PGlite) with a Supabase stub.
- `tools/rehearse_production_replica.mjs` — same, against a replica of the REAL production shape: proves the
  `tasks` collision, the pre-step, the rollback and per-migration object counts.
  Setup (outside the project): `mkdir %TEMP%\pg && cd %TEMP%\pg && npm init -y && npm i @electric-sql/pglite`,
  then `node <repo>\supabase\production-prep\tools\<tool>.mjs <repo>`.

`04_…` is generated from the reference inventory of 0001–0021; regenerate it if a migration is added.

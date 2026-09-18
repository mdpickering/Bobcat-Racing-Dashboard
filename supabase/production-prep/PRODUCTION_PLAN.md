# Phase 6.7 — Production schema preparation plan

Status: **plan only. Nothing was applied to any Supabase project. `workspace_state` and every legacy
table were never modified.** Production was inspected read-only via the SQL Editor (scripts 01 and 02).

Evidence base: `results/prod_01_inventory.json` (production catalog inventory, 2026-09-18),
`results/prod_02_workspace_state_shape.json` (SELECT-only shape profile), `results/prod_03_reconcile.json`
(legacy reconciliation facts: ids, counts, enum-like values, fingerprints), the 21 migrations in
`supabase/migrations/`, and scratch rehearsals on an in-memory Postgres (PGlite) — see §12.
`results/dev_01_inventory.json` is the **real bobcat-dev catalog inventory** (27 tables, 88 policies, taken 2026-09-18 15:54 UTC). It was checked against a
reference produced by applying 0001–0021 to a clean scratch database: **identical in every migration-owned section** (§2, R6 closed).
All four result files validate (`node tools/check_results.mjs` ⇒ "ALL FOUR RESULT FILES READY").

---
## 0. Executive summary — owner decisions recorded 2026-09-18

**Decisions approved by the project owner**
1. **Path A — a separate, new production Supabase project.** The legacy project is left exactly as it is.
   `prestep/00_rename_legacy_tasks.sql` and `rollback/00_undo_rename_legacy_tasks.sql` are kept for the record and are **not used**.
2. **D3 — import the union of the two legacy task datasets, `workspace_state` winning on overlapping ids** (§9.4).
3. **D4 — unresolved legacy records are migrated later, not guessed now.** Rows whose subsystem the source data does not
   establish (`chassis`, `brakes`, `rear-suspension`) are kept as **`migration_exceptions` carrying the full legacy record**, so
   they can be resolved later without losing data (§9.12).
4. **Intended destination areas** for the legacy data: **Drivetrain, Rear Suspension, Front Suspension, Pedals, Shielding**
   — recorded as the target set for any later mapping. No mapping to them is invented (§9.12, incl. one open clarification, Q-A).

**State of the evidence**
1. The old production project is a **legacy 4-table project**: `orders`, `subteams`, `tasks`, `workspace_state`, with
   **0 auth users, 0 functions, 0 enums, 0 triggers, 0 storage buckets**. Every legacy table is readable **and writable** by anyone
   with the public key (R1). It is **read-only source data** for this migration.
2. The one collision that mattered — legacy `public.tasks` vs migration 0004 — **does not arise under Path A** (the target is
   a clean project). Proven on a replica of the real production shape: unmodified 0001–0021 fails at 0004 *only* in the old project.
3. **The schema chain is verified twice:** 0001–0021 apply cleanly, in order, to a clean database (rehearsal), and **the real
   bobcat-dev inventory is identical to that reference in every migration-owned section** (tables, columns, 120 column ACLs, 87 indexes,
   94 constraints, 10 enums, 88 policies, bucket) — §2.
4. Data is tiny: 49 `workspace_state` tasks (+30 in a separate relational table), 7 subsystems, 25 categories, 15 timeline columns,
   5 milestone cells, 1 recurring event, 2 orders, 1 subteam. With **0 auth users there is nothing to migrate for auth/profiles**, which
   creates **B2**: `created_by` / `requested_by` / `changed_by` / `updated_by` are NOT NULL foreign keys to `profiles`, so a real,
   approved CTO profile must exist **in the new project before any data import**.
5. The reconciliation data settled the mapping: order statuses (`Requested`→Submitted, `Arrived in Shop`→identical); timeline
   `highlight` (`none`→false, `emerald`→true) and the odd key `BREAK` (label `W8`); all 49 `workspace_state` tasks pass every
   new-schema rule; deadlines are 42 blank + 7 ISO dates.
6. Migration **0021 is included** (last in the chain). `profiles.active` defaults to `true`, so the first CTO/admin needs only
   `approved = true` and `role = 'cto'` (§8).

**Still open (none of it blocks finishing Phase 6.7 — all are Phase 6.8 entry items):** create the new project + configure Auth,
apply 0001–0021, first CTO account (B2), and the clarification Q-A (§9.12). Nothing was applied anywhere in Phase 6.7.

---
## 1. Production schema inventory (what exists — Q1)

PostgreSQL 17.6. Extensions: `pg_stat_statements`, `pgcrypto` (schema `extensions`), `plpgsql`,
`supabase_vault`, `uuid-ossp` (schema `extensions`).

| Object | Detail |
|---|---|
| `public.tasks` | ~30 rows (estimate). `id text PK`, `title text NOT NULL`, `subsystem_id text`, `category text`, `priority text default 'Medium'`, `status text default 'To Do'`, `assignee text`, `deadline date`, `notes text`, `created_at timestamptz`. No FKs, no other indexes. |
| `public.orders` | ~2 rows. `id text PK`, `item`, `subsystem_id`, `vendor`, `vendor_url`, `part_number`, `qty int default 1`, `unit_price numeric(10,2) default 0`, `urgency text default 'Next Batch Order'`, `requested_by text`, `status text default 'Requested'`, `submitted_at timestamptz`. |
| `public.subteams` | ~1 row. `id text PK`, `name`, `lead text`, `members text[]`, `subsystem_id text`. |
| `public.workspace_state` | 1 row. `id text PK`, jsonb columns `taxonomy`, `tasks`, `orders`, `timeline_columns`, `recurring_events`, `timeline_milestones`, `updated_at`. Row `id` = `bobcat_master_workspace_state`; last updated **2026-09-08 17:09 UTC**. |
| RLS / policies | RLS on for all four, but every policy is `USING (true)` for role `public`: `Allow all on orders/subteams/tasks` (ALL), `Enable public read for all` (SELECT) + `Enable public write/upsert for all` (ALL) on `workspace_state`. |
| Grants | `anon`, `authenticated`, `service_role` hold `arwdDxtm` on all four (Supabase default privileges). |
| Realtime | `supabase_realtime` publishes all four tables. The v2 app uses no realtime. |
| Functions / enums / sequences / triggers (public) | **none**. |
| Storage | 0 buckets, 0 objects; only Supabase-managed triggers on `storage.*`. |
| Auth | **0 users**, no identities. |
| workspace_state content (shape) | `tasks[]` 49 (status To Do 37 / In Progress 11 / Complete 1; priority Medium 31 / High 9 / Critical 7 / Low 2; 6 subsystemIds; 18 distinct category names; only 7 have a deadline, others `""`); `taxonomy[]` 7 subsystems each with `id,name,lead,leadPin,members[],categories[{name,rule}]` (25 categories); `timeline_columns[]` 15 `{key,label,highlight(string)}`; `timeline_milestones` object `{subsystemId:{W4:text}}` = 5 cells (+1 empty subsystem); `recurring_events[]` 1 `{id,title,dayOfWeek,time,color}`; `orders[]` **empty**. |

---
## 2. Development vs production diff (Q1–Q4)

From `compare_inventory.mjs` (production vs reference inventory):

| Class | Objects | Action |
|---|---|---|
| **CREATE** (in dev, absent in prod) | 26 tables, 10 enum types, 35 functions, 39 triggers (38 on `public`, 1 on `auth.users`), 86 `public` RLS policies + 2 `storage.objects` policies, 120 column-level ACL entries, 1 storage bucket. (Across all 27 v2 tables: 87 indexes and 94 constraints = 27 PK, 47 FK, 13 UNIQUE, 7 CHECK.) | created by 0001–0021 |
| **CONFLICT** | `public.tasks` (and its index/constraint name `tasks_pkey`, and the row type `tasks`) | only against the **old** project — **avoided by Path A** (§3); nothing is renamed |
| **ALTER** existing production objects | **none** (the migrations never alter a pre-existing production table) | — |
| **LEAVE ALONE** | `public.orders`, `public.subteams`, `public.workspace_state`, their policies, grants, realtime membership, all Supabase-managed schemas/triggers/extensions | never dropped, renamed or modified |
| Silent-overwrite risk (`create or replace function`) | production has **0** functions ⇒ none can be overwritten | — |
| Extension | 0002 `create extension if not exists pgcrypto` ⇒ no-op (already installed, schema `extensions`) | — |

The `04_preflight_checks_readonly.sql` query re-verifies all of the above on the day.

### Real bobcat-dev vs migrations reference vs old production (measured)
| comparison | result |
|---|---|
| **real dev vs reference (0001–0021 on a clean DB)** | **identical** for tables (27 v2), columns, 120 column ACLs, 87 indexes, 94 constraints, 10 enums, 88 policies (86 public + 2 storage), storage bucket. Dev-only extras are all Supabase-managed (below). |
| **old production vs real dev** | only in dev: 26 tables, 10 enums, 88 policies, 120 column ACLs, 1 bucket; `public.tasks` differs (the collision); only in production: `orders`, `subteams`, `workspace_state`, their 5 open policies and the realtime publications. Extensions and default privileges match. |
| Supabase-managed extras in dev (beyond the migrations) | function `public.rls_auto_enable()` (SECURITY DEFINER, `search_path=pg_catalog`, returns `event_trigger`) + event trigger `ensure_rls` = the platform's *auto-enable RLS on new tables* feature; 3 extra `storage.buckets` protection triggers (`protect_bucket_control_insert/update/update_role`); 4 auth users (3 `bobcat-test.dev`, 1 real). The old production project has none of these (older platform version). |

The extras are not a problem: `ensure_rls` only turns RLS **on** (the migrations already do), no name collides with a target object, and migration 0017's SQL insert into
`storage.buckets` succeeded on dev with those triggers present (dev shows the bucket with identical limits). A new Path A project is expected to look like dev.

---
## 3. Decision record — the `public.tasks` collision: **Path A (approved)**

| | **Path A — new v2 project (CHOSEN)** | Path B — same project, rename legacy `tasks` (rejected) |
|---|---|---|
| Collision | none (clean target) | resolved by rename |
| Violates "don't rename production tables" | no | yes |
| Legacy app / `public.tasks` readers | untouched | would break |
| Legacy public-write exposure (R1) | stays isolated in the old project | v2 tables live beside open tables in one API |
| Rollback | discard/ignore the new project | `99_rollback…` + `00_undo_rename…` |
| Migration set | 0001–0021 unchanged | 0001–0021 + `prestep/00` |

Not viable either way: installing v2 into another schema (every migration/function/`search_path` hard-codes `public`), or
altering legacy `tasks` in place (ids text→uuid, columns dropped — destructive).

### Path A operating model
1. **Create the new project** in the Supabase Dashboard (a human action; record the project ref only — never keys in the repo).
2. **Configure Auth** in the Dashboard (Site URL, redirect URLs, email confirmation/SMTP) — not SQL.
3. Run `01_inspect_schema_readonly.sql` on the new project (baseline: `public` empty; managed extras as in bobcat-dev, §2) and
   `04_preflight_checks_readonly.sql` ⇒ `all_clear: true`.
4. Apply 0001–0021 exactly as §4 (one file at a time, each in `begin; … commit;`).
5. Verify with `compare_inventory.mjs <new-project inventory> results/dev_01_inventory.json` (§11).
6. Point the deployed app at the new project (URL + publishable key; the human sets them; **no service-role key is ever used**).
7. First CTO signs up and is promoted (§8), *then* the import (Phase 6.8).

**Moving the legacy data across projects (design for 6.8):** the old project is read with a read-only `SELECT` that returns the
legacy rows as one JSON value; that JSON is pasted as a dollar-quoted `jsonb` literal into the import script and run in the
**new** project's SQL Editor. No staging table, no cross-project connection, no credentials, and the old project is never written to.

Everything below applies to Path A. (Path-B-only notes were removed from the checklists.)

---
## 4. Migration order (Q11) — exact, per-file, atomic

Apply **one file at a time** in the SQL Editor, wrapped in `begin; … commit;` (the rehearsal ran every
file that way; a failure rolls that file back completely). Never skip or reorder; 0021 stays last.

| Stage | Files | New-schema objects after the stage (tables / functions / triggers / policies / enums / indexes / buckets) |
|---|---|---|
| **0 pre-flight** | on the **new** project: `01_…` baseline, then `04_preflight_checks_readonly.sql` → must be `all_clear: true` (no pre-step; Path A) | — |
| A identity & org | 0001, 0002, 0003 | 5 / 7 / 6 / 15 / 2 / 12 / 0 |
| B tasks | 0004, 0005, 0006 | 11 / 14 / 14 / 33 / 6 / 32 / 0 |
| C purchasing & CAD | 0007, 0008, 0009 | 17 / 21 / 23 / 49 / 8 / 55 / 0 |
| D calendar, timeline, notifications, audit/migration infra | 0010, 0011, 0012, 0013 | 27 / 25 / 33 / 76 / 10 / 87 / 0 |
| E hardening & auto-notifications | 0014, 0015, 0016 | 27 / 30 / 38 / 77 / 10 / 87 / 0 |
| F storage | 0017, 0018, 0019 | 27 / 30 / 38 / 79 / 10 / 87 / **1** |
| G admin RPCs + active enforcement | 0020, **0021** | **27 / 35 / 39 / 88 / 10 / 87 / 1** |

Counts are cumulative object counts of a clean install (production adds its Supabase-managed items:
+4 storage triggers, +4 legacy tables/policies, etc.). After each **file** run `01_inspect_schema_readonly.sql`
if a stricter checkpoint is wanted; after Stage G the result must equal the reference (§11).
Per-migration counts for every one of the 21 files were captured in the rehearsal (S4).

Why per-file and not a squash: the chain is exactly what was tested on bobcat-dev and rehearsed here.
0017→0019 and 0002→0021 redefine objects (intermediate states are harmless and transactional).

---
## 5. RLS, functions, triggers, grants that get installed (Q9)

All 27 tables get RLS (verified: `rls=true` for every table in the reference). Highlights:
- **Column-level grants** are the real write boundary (120 ACL entries): `revoke all` from
  `anon, authenticated`, then narrow `grant select` / `grant (col…)`. `profiles.role/approved/active`, `tasks.primary_owner_id`,
  `*.legacy_*`, `audit_logs`, `migration_log`, `purchase_status_history` have **no** API write grant.
- **SECURITY DEFINER** (21 functions, all `search_path=public`). The 11 that are RPC/policy-callable
  (`is_*` ×5, `can_access_*` ×3, `admin_set_user_*` ×3) are `EXECUTE` **authenticated-only** (dual `revoke … from public`
  and `from anon, authenticated`, re-granted). The other 10 are trigger functions (`returns trigger`), not callable as RPC.
- 14 of the 24 trigger functions keep default PUBLIC EXECUTE — accepted: PostgreSQL refuses to call a
  `returns trigger` function directly.
- **0021**: `active` enforced by the RLS helpers + 9 restrictive `require_active_user` policies (proven in 6.6).
- **Legacy tables are not touched by any migration** and keep their open policies (see R1).
- Default privileges: production already grants `anon/authenticated/service_role` full DML on new `public`
  tables (standard Supabase). Identical to bobcat-dev; the migrations' revoke-then-grant makes RLS + column
  grants the boundary in both.

## 6. Storage configuration (Q10)

Production has no bucket. 0017 inserts `task-attachments` (private, `file_size_limit` 20 MiB, 12 allowed MIME
types) with `on conflict (id) do update` — **it would silently overwrite an existing bucket's limits**, which
is why pre-flight check #5 requires the bucket to be absent. Policies: `task_attachments_storage_select` /
`_insert` on `storage.objects` (access via `can_access_task()`; 0019 replaces 0017's insert policy, dropping
the unreliable metadata checks — size/type are enforced by bucket limits + client validation). No update/delete
policy by design. Pre-flight #7 confirms RLS is on for `storage.objects`. Object key convention
`<task_id>/<timestamp>-<filename>`; there are 0 objects to migrate.

---
## 7. Auth / profile migration

- **0 auth users ⇒ no auth or profile data to migrate.** Legacy "identity" is free text (assignee, lead,
  members[], requested_by) plus lead PINs.
- Trigger `on_auth_user_created → handle_new_user` (0001, hardened 0014) creates a profile for every future
  sign-up: `approved=false, active=true, role='member'`. Because production has no users, installing it
  before any user exists needs **no backfill**.
- Legacy people become real accounts by signing up and being approved through the app. Their legacy names
  are preserved as raw text (`tasks.legacy_assignee_raw`) and as `migration_exceptions` for an admin to resolve.

## 8. First production CTO/Admin (blocker B2)

1. Deploy/serve the v2 app against the target project; the person signs up normally (confirm the project's Auth
   settings first: Site URL / redirect URLs, email confirmation, SMTP — **Dashboard settings, not SQL**).
2. Verify a profile row was auto-created (`approved=false`, `active=true`).
3. In the SQL Editor (as `postgres`; API grants don't apply), one statement, by a human:
   ```sql
   update public.profiles set approved = true, role = 'cto' where email = '<cto-email>';
   ```
   `active` is already `true`; **0021 makes `active=true` mandatory for a usable account**, so verify it.
4. Sign in and confirm `/admin` loads. This profile's uuid becomes the **importer id** for Phase 6.8.

Further users: sign up → pending → approved by this CTO through Admin (0020 RPCs).

---
## 9. `workspace_state` → new schema data mapping (Q5–Q8)

Import mechanics (proven on the scratch DB): a straight `INSERT` **fails** — the `BEFORE INSERT` triggers
overwrite `created_by`/`requested_by`/`user_id`/`uploaded_by`/`updated_by` with `auth.uid()` (NULL in the SQL
Editor ⇒ NOT NULL violation), force purchases to `Draft`, null `primary_owner_id`, and reset `completed_at`;
`AFTER` triggers create notifications. The import therefore runs as **one transaction**, `ALTER TABLE … DISABLE
TRIGGER <name>` for exactly the triggers below, explicit column values, then `ENABLE TRIGGER` for the same list
and a check that no user trigger has `tgenabled <> 'O'`. (Rehearsed: attribution, `completed_at`, `owner`, raw
status and imported history rows all preserved; all triggers re-enabled.)

| Disable during import | Why |
|---|---|
| `tasks.tasks_before_write` | overwrites `created_by`, `primary_owner_id`, `completed_at` |
| `purchase_requests.purchase_requests_before_write` | forces `Draft`, `requested_by`, `reviewed_*` |
| `purchase_requests.purchase_requests_log_status_change` | auto-history with `changed_by = auth.uid()` (NULL) |
| `purchase_requests.purchase_requests_notify_status_change`, `task_assignees.task_assignees_notify_assignment`, `task_requests.task_requests_notify_reviewed`, `cad_reviews.cad_reviews_notify_status_change`, `comment_mentions.comment_mentions_notify`, `member_applications.member_applications_notify_reviewed` | would spam notifications for imported rows |
| `timeline_milestones.timeline_milestones_before_write` | overwrites `updated_by`/`updated_at` |
| Keep enabled | `task_assignees_sync_primary_owner` (derives `primary_owner_id`), all `set_updated_at` triggers, `on_auth_user_created` |

Import runs as `postgres` in the SQL Editor (no service-role key, no script credentials). `migration_log`/
`migration_exceptions` (0011) are filled by that same SQL, keyed `(entity_type, legacy_id_or_key)` so a re-run
can skip already-migrated rows.

### 9.1 subsystems ← `taxonomy[]` (7)
| new | from | rule |
|---|---|---|
| `subsystems.id` (text) | `taxonomy[].id` | **preserved exactly** (e.g. `pedals-driver-controls`, `front-suspension`, `shielding-safety`, `drivetrain-fitment`, `sae-deliverables`, `fabrication`, `rear-suspension-brakes`) |
| `name` | `taxonomy[].name` | as-is; `subsystems.name` is UNIQUE (duplicates listed by script 03) |
| `active` | — | `true`; `description` NULL |
| **not migrated** | `lead`, `members[]`, **`leadPin`** | `lead`/`members` → `migration_exceptions` (entity `subsystem_lead` / `subsystem_member`, raw text) for later `subsystem_members` assignment. **`leadPin` is never migrated** (plaintext credential; §13 R1). |

Verified (script 03): 7 subsystems, **0 duplicate names**; every one has a lead and a `leadPin` (7 PINs); member strings total 4
(front-suspension 1, pedals-driver-controls 1, sae-deliverables 2, others 0).

| id (preserved) | name | categories |
|---|---|---|
| `drivetrain-fitment` | Powertrain & Drivetrain Tuning | 3 |
| `fabrication` | Fabrication & Vehicle Integration | 4 |
| `front-suspension` | Front Suspension & Steering | 4 |
| `pedals-driver-controls` | Pedal Box & Driver Controls | 4 |
| `rear-suspension-brakes` | Rear Suspension & Rear Brakes | 4 |
| `sae-deliverables` | SAE Deliverables & Costing | 3 |
| `shielding-safety` | Shielding & Cockpit Safety | 3 |

### 9.2 subsystem_categories ← `taxonomy[].categories[]` (25)
`subsystem_id` = parent id; `name` = `name`; `engineering_rule` = `rule`; `active` = true; new uuid.
**25 categories, 0 duplicate names within a subsystem** (the `(subsystem_id,name)` UNIQUE constraint cannot fire).
No `legacy_id` column ⇒ record `(category, '<subsystemId>::<name>') → new uuid` in `migration_log`.

### 9.3 tasks ← `workspace_state.tasks[]` (49) — verified against script 03
| new | from | rule |
|---|---|---|
| `id` | — | new uuid; **`legacy_id` = legacy id** (text, 3–14 chars, all 49 unique, UNIQUE column) |
| `title` / `description` | `title` / `notes` | blank notes → NULL |
| `subsystem_id` | `subsystemId` | **all 49 exist in the taxonomy** (0 unknown) |
| `category_id` | `category` (name) | lookup `(subsystem_id, name)` in 9.2. **All 49 resolve in their own subsystem** (0 blank, 0 mismatches), so the `tasks_before_write` category rule cannot fire for this set |
| `status` | `status` | To Do 37 / In Progress 11 / Complete 1 — identical to the new enum, **0 unmapped** |
| `priority` | `priority` | Medium 31 / High 9 / Critical 7 / Low 2 — identical, **0 unmapped** |
| `deadline` (timestamptz) | `deadline` (string) | **42 blank → NULL; 7 ISO dates (2026-09-15 … 2026-11-30) → midnight UTC**, the exact convention the app writes (`new Date(d).toISOString()`) and reads (`slice(0,10)`); **0 non-ISO values** |
| `created_by` | — | **importer profile id** (legacy has no creator) |
| `created_at` | — | import time (these rows carry no timestamp; only `workspace_state.updated_at` = 2026-09-08 exists) |
| `completed_at` | — | for the 1 `Complete` task: import time (real completion time unknown) |
| `legacy_assignee_raw` | `assignee` | raw text; **40 of 49 blank → NULL; 4 distinct names on 9 tasks, 2 names shared by several tasks**; one exception per distinct name |
| `primary_owner_id`, `task_assignees` | — | none (no profiles). Assigned in the app after sign-up / from resolved exceptions (6.8 relink step) |
Duplicate titles within a subsystem: 0.

### 9.4 relational `public.tasks` (30) — what the data shows, and decision **D3**
Script 03 measured the two stores against each other:

| fact | value |
|---|---|
| rows | relational **30**, `workspace_state` **49** |
| ids in both | **10** |
| only in `workspace_state` | **39** |
| only in relational (20) | `t1 t2 t3 t4 t5 t6 t7 t8 t9 t10 t11 t12 t13 t14 t15 t16 t17 t28 t1787328031626 t1787328873948` |
| on the 10 shared ids, fields that **differ** | title **8**, status **5**, deadline **10**, subsystem **1**, assignee 0 |
| relational status / priority | To Do 20 / In Progress 9 / Complete 1 — Critical 11 / High 10 / Medium 9; all valid for the new enums |
| relational `created_at` | 2026-08-21 … 2026-08-25 (the table has **no** `updated_at`) |
| `workspace_state.updated_at` | 2026-09-08 17:09 UTC (later than every relational row's creation) |
| relational subsystem ids | 24 rows use taxonomy ids (front-suspension 4, sae-deliverables 4, shielding-safety 4, drivetrain-fitment 4, pedals-driver-controls 4, rear-suspension-brakes 4) and **6 rows use ids that are not in the taxonomy**: `chassis` 4, `brakes` 1, `rear-suspension` 1 (→ **D4**) |

The two stores are **not copies**: they overlap only partly and the overlap has diverged. Which one is "right" cannot be
decided from counts (recency per row is unknowable). The relational rows' categories and deadlines have **not** been rule-checked yet.
`05_tasks_side_by_side_readonly.sql` produces the row-by-row report (ids, titles, status, priority, deadline, subsystem,
category-validity, and the 10 shared pairs side by side) for a human to review; save it as `results/prod_05_tasks_side_by_side.json`.

**Decision D3 — task source of truth — DECIDED (owner-approved): option 2, union with `workspace_state` winning (see §9.12)**
| option | effect |
|---|---|
| 1. `workspace_state` only (49) | simplest; the 20 relational-only tasks are **not** carried into v2 (they stay in the untouched legacy table) |
| **2. Union, `workspace_state` wins on the 10 shared ids — ✅ APPROVED** | 39 + 10 from `workspace_state` = 49, **plus the 20 relational-only rows** = up to **69**. `workspace_state` is the later-written store. Nothing is silently dropped; each shared id is imported once (the relational version is logged `skipped`, "superseded"). Rows whose subsystem is unmapped (D4) are held as `migration_exceptions` with the full record (§9.12) and imported later once explicitly mapped; a row whose category is invalid is imported with `category_id` NULL plus a `task_invalid_category` exception. Caveat: the ids `t1…t17` look like early seed data — review with script 05 before accepting |
| 3. relational wins on the shared ids | not recommended (older store) |

### 9.5 purchase_requests + purchase_request_items ← `public.orders` (2)  (`workspace_state.orders` is empty)
Facts: ids `o1787624828935`, `o1787626195417`; statuses **Requested 1, Arrived in Shop 1**; urgency **Immediate Need ×2**;
subsystem **`chassis` ×2 (not in the taxonomy → D4)**; both have `vendor_url` and `part_number`; qty 2–4; **no zero/NULL prices**;
1 distinct requester (none blank); submitted 2026-08-25.

| new | from | rule |
|---|---|---|
| `purchase_requests.legacy_id` / `purchase_request_items.legacy_id` | `orders.id` | preserved |
| `title` | `item` | |
| `subsystem_id` | `subsystem_id` | `chassis` is not a v2 subsystem and the source does not establish a mapping ⇒ **both orders are held as `purchase_request_unmapped_subsystem` exceptions with the full legacy row in `context` (§9.12); no purchase rows are created initially** and no subsystem is guessed. The status/field mapping below is applied at the later re-import once the owner maps `chassis`. |
| `vendor` | `vendor` | |
| `description` | `urgency`, `requested_by` | `Urgency: Immediate Need · Legacy requester: <raw>` (no `legacy_requested_by` column exists; also 1 exception row) |
| `requested_by` | — | **importer id** |
| `status` + **`legacy_status_raw`** | `status` | raw text **always** stored in `legacy_status_raw`; enum mapped below |
| item `description`/`quantity`/`unit_cost`/`link`/`notes` | `item`/`qty`/`unit_price`/`vendor_url`/`part_number` | prices are all > 0 ⇒ kept **as-is** (no 0→NULL rule needed); `notes = 'Part #: …'` |
| `created_at` | `submitted_at` | |
| history | — | one `purchase_status_history` row per order: `from NULL → mapped`, `changed_by` importer, `changed_at = submitted_at`, note `Imported; legacy status: <raw>` (the trigger that normally writes it is disabled) |
| `reviewed_by/at` | — | NULL (legacy reviewer unknown) |

**Legacy status mapping (confirmed by the data — only these two values exist):**
| legacy | → `purchase_status` |
|---|---|
| `Requested` (1 order; also the column default) | **Submitted** |
| `Arrived in Shop` (1 order) | **Arrived in Shop** (already identical to the new enum label) |
| anything else appearing at import time | **Draft** + `migration_exceptions` (`purchase_status`) — never guessed; `legacy_status_raw` keeps the raw value |

### 9.6 timeline_columns ← `timeline_columns[]` (15) — resolved
Keys: `W1 W2 W3 W4 W5 W6 W7 BREAK W9 W10 W11 W12 W13 W14 W15`. **The 8th column has key `BREAK` but label `W8`.**
- `key` = legacy `key` **verbatim, including `BREAK`** (case exact; it is the FK target of milestone cells); `label` = legacy `label` (`W8`).
  The UI renders `col.label` and uses `col.key` only for cell lookup, so `BREAK`/`W8` displays as "W8".
- `sort_order` = array position 1…15 (`BREAK` = 8); `active` = true.
- `highlight` (legacy string) → boolean: **`none` (14) → false; `emerald` (1, on `W3`) → true.** Rule: any value other than `none`/blank → true.
  The colour name is not representable (the new column is boolean; the UI uses the gold highlight) — the raw value is kept in `migration_log.notes`.
- 0 duplicate keys.

### 9.7 timeline_milestones ← `timeline_milestones{subsystemId:{colKey:text}}` (5 cells) — resolved
Exactly 5 cells, **all in column `W4`**: `drivetrain-fitment`, `front-suspension`, `pedals-driver-controls`, `rear-suspension-brakes`,
`shielding-safety` (text lengths 13–32). **0 cells with an unknown subsystem or column.** `fabrication` has an empty object ⇒ no row.
`(subsystem_id, timeline_column_key)` preserved; `updated_by` = importer.

### 9.8 recurring_events ← `recurring_events[]` (1) — resolved
`dayOfWeek` **2**, `time` **`12:30`**, `color` **`navy`** (a colour *name*, not hex — stored verbatim in the free-text `color`),
title 14 chars, no other keys. `day_of_week = 2` (Tuesday under the new schema's 0 = Sunday convention). **Residual check before
import:** confirm the legacy UI also counts 0 = Sunday, otherwise the event lands a day off. `subsystem_id` NULL; new uuid (legacy id → `migration_log`).

### 9.9 No legacy source (created empty)
`calendar_events`, `milestones`, `competition_settings` (entered by CTO/Admin in the UI), `member_applications`,
`task_requests`, comments, attachments, CAD, notifications, `audit_logs`.

`public.subteams` (1 row, id `st_1787328826054`): `subsystem_id = rear-suspension` (**not** a taxonomy id — D4), a lead, and **4
members**. v2 has no "team" concept, so it has no target table: recorded in `migration_log` as `skipped`; its lead and 4
members join the exception list (entity `subsystem_lead` / `subsystem_member`) for the CTO to assign once accounts exist.

### 9.10 ID preservation summary
Preserved verbatim: `subsystems.id`, `timeline_columns.key`, milestone composite keys. Preserved in `legacy_id`
(+ `migration_log`): tasks, purchase requests/items. New uuid + `migration_log` mapping only: categories, recurring events.

### 9.11 Relationships created after import
`tasks.category_id → subsystem_categories`; `task_assignees` + `primary_owner_id` (via sync trigger) once profiles
exist; `subsystem_members` (leads/members) after sign-up; `purchase_status_history → purchase_requests`;
`timeline_milestones → timeline_columns / subsystems`. All FKs are created by the migrations; the import only
has to insert parents before children.

### 9.12 Decisions D3 / D4 — approved, and how unresolved records are kept (owner-approved 2026-09-18)

**D3 — approved:** union of the two task datasets, `workspace_state` wins on the 10 shared ids (§9.4). Accounting invariant for the import:
`49 (workspace_state, all imported) + 10 shared relational rows (logged 'skipped — superseded') + 20 relational-only rows`
where the 20 are either imported or held as exceptions ⇒ **imported + held = 69 tasks exactly**, nothing unaccounted for.

**D4 — approved policy: do not guess a subsystem; keep unresolved records as `migration_exceptions`, resolve them later.**
`subsystems.id` is preserved from the taxonomy and `tasks.subsystem_id` / `purchase_requests.subsystem_id` are NOT NULL foreign keys,
so a row whose legacy subsystem id is not one of the 7 real ids cannot be inserted. Legacy ids that the source data does **not** establish:

| unknown legacy id | used by | handling |
|---|---|---|
| `chassis` | 4 relational tasks, **both orders** | **exception** — no mapping asserted |
| `brakes` | 1 relational task | **exception** |
| `rear-suspension` | 1 relational task, the `subteams` row | **exception** (even though it resembles `rear-suspension-brakes`, the source does not establish that they are the same) |

Only rows that would otherwise be imported are affected: **both orders** and **up to 6 relational tasks** (fewer if some of those 6
are among the 10 shared ids, where the `workspace_state` version — real taxonomy ids — wins). All 49 `workspace_state` tasks are unaffected.
Earlier "candidate" mappings in previous drafts of this plan were **withdrawn**; none is asserted.

**How nothing is lost — exception record design (no schema change, no new migration).** `migration_exceptions` already has
`entity_type`, `raw_value`, `context jsonb`, `resolution_status` (default `unresolved`). One row per held record:

| column | content |
|---|---|
| `migration_batch_id` | one uuid per import run (same value written to `migration_log`) |
| `entity_type` | `task_unmapped_subsystem`, `purchase_request_unmapped_subsystem`, `subteam_unmapped_subsystem`; people/other: `task_assignee`, `subsystem_lead`, `subsystem_member`, `purchase_requester`, `task_invalid_category`, `purchase_status` |
| `raw_value` | a human-readable one-liner **shown in the Admin UI** (e.g. `task t1787328031626 · legacy subsystem "chassis" · <title>`) |
| `context` | the **complete legacy record** (every source column/JSON field) + `source` (`public.tasks` / `workspace_state.tasks` / `public.orders` / `public.subteams`), `legacy_id`, `unmapped_field`, `unmapped_value`, source fingerprint |
| `resolution_status` | stays `unresolved` until the record is actually imported |
plus a `migration_log` row `(entity_type, legacy_id) → new_id NULL, status 'exception'`. The legacy source tables are also untouched, so every held record exists **twice** (exception `context` + old project).

**Resolving later (a future step, not Phase 6.7/6.8's first import).** The owner supplies an explicit written mapping
`legacy subsystem id → real subsystem id` (targets restricted to the five destination areas below unless the owner says otherwise). A small
re-import SQL, using the same trigger-disable mechanics as the initial import, reads the unresolved exceptions, inserts the tasks/purchase
requests with the mapped subsystem, sets `migration_log` to `migrated` with the new id, and marks the exception `resolved`.

**Operational caution (verified in the code):** the Admin "Migration exceptions" panel shows `entity_type`, status and `raw_value`, and its
Resolve / Ignore buttons **only change `resolution_status`** — they do **not** import anything. Admins must **not** click Resolve/Ignore on
`*_unmapped_subsystem` rows before the re-import has run, or the record would look finished while never being imported (its data would
still be safe in `context`).

**Intended destination areas (owner):** Drivetrain, Rear Suspension, Front Suspension, Pedals, Shielding. They correspond, by id and name, to the
taxonomy subsystems that already exist in the source data:

| destination area | subsystem id (from the source taxonomy) | source name |
|---|---|---|
| Drivetrain | `drivetrain-fitment` | Powertrain & Drivetrain Tuning |
| Rear Suspension | `rear-suspension-brakes` | Rear Suspension & Rear Brakes |
| Front Suspension | `front-suspension` | Front Suspension & Steering |
| Pedals | `pedals-driver-controls` | Pedal Box & Driver Controls |
| Shielding | `shielding-safety` | Shielding & Cockpit Safety |

Subsystem **names are imported verbatim from the source**; they are not renamed to the short labels (renaming is a later, separate choice).

**Open clarification Q-A (does not block finishing 6.7):** the source taxonomy has **seven** subsystems; two are **not** among the five
areas — `fabrication` (Fabrication & Vehicle Integration; 2 `workspace_state` tasks, 4 categories) and `sae-deliverables` (SAE Deliverables & Costing;
5 `workspace_state` tasks + 4 relational, 3 categories). Their tasks carry real taxonomy ids, so the source **does** establish them and they are
**imported as-is with nothing dropped**. If the owner intends only five subsystems, these can be archived later (`subsystems.active = false`,
archive-over-delete, no data loss) or their tasks re-homed — that is a decision to make explicitly, not one this plan makes.

---
## 10. Pre-flight checklist (before ANY change) — Path A

1. New Supabase project created; project ref recorded; **no keys stored in the repo**.
2. `01_inspect_schema_readonly.sql` on the new project (baseline) and `04_preflight_checks_readonly.sql` ⇒ **`all_clear: true`**
   (a clean project passes; tested).
3. Auth settings configured (Site URL, redirects, email confirmation/SMTP); backup/PITR availability for the new project's plan confirmed.
4. Migration files on the commit being applied match the rehearsed set (record `git rev-parse HEAD`).
5. Human present; **one file per SQL Editor run, each wrapped in `begin; … commit;`**.
6. **Before the import (6.8):** re-run `01_…` on the OLD project and compare with `results/prod_01_inventory.json` (schema drift), and re-run `03_…`
   comparing `fingerprints` (the legacy tables are anon-writable ⇒ data can change). **Baseline captured 2026-09-18 from `prod_03` (hashes only, no content):**

   | source | md5 baseline |
   |---|---|
   | `workspace_state.tasks` | `1eb724f93f71730f43f5760366456ff8` |
   | `workspace_state.taxonomy` | `68605bf421fdd84b5116526cf91dbdbb` |
   | `workspace_state.orders` | `d751713988987e9331980363e24189ce` |
   | `workspace_state.timeline_columns` | `e3ffea8a87f2d86777f4733ca7679e3b` |
   | `workspace_state.recurring_events` | `239a0c95988fd4d94d277ca80dd562be` |
   | `workspace_state.timeline_milestones` | `43eb4eb1ff583ad31bdbc309559678d5` |
   | `workspace_state.updated_at` | `2026-09-08T17:09:28.632+00:00` |
   | table `public.tasks` | `5e34cca3ff667b070de136004e2d598d` |
   | table `public.orders` | `53df8fc92d204df9c8bb93af878306cb` |
   | table `public.subteams` | `eefd49f2fe63111d3e87f4e355dc5160` |

   Any difference ⇒ the source moved since this plan; redo the reconciliation before importing.
7. Export the legacy data offline (SELECT → JSON): `workspace_state`, `tasks`, `orders`, `subteams` (this is also the import payload).

## 11. Verification checklist

**Per stage:** run `01_…` on the new project and compare with the §4 counts.
**After Stage G (before any data):** `node tools/compare_inventory.mjs <new-project inventory> results/dev_01_inventory.json new dev` must show **no difference in any
migration-owned section** (tables, columns, column ACLs, indexes, constraints, enums, functions, triggers, policies, bucket). Expected, tolerated differences:
auth users (dev has 4 test users), and Supabase-managed items if the two projects are on different platform versions. bobcat-dev itself carries these
managed extras beyond the migrations — the new project will very likely too: function `public.rls_auto_enable()` + event trigger `ensure_rls`
(auto-enable RLS on new tables), extra `storage.*` bucket-protection triggers, extensions `pg_stat_statements` / `supabase_vault` / `uuid-ossp`.
- 27 tables all `rls=true`; RPC functions `EXECUTE` only for `authenticated`; **no** `anon` grant on any v2 table (column ACLs = 120).
- Bucket `task-attachments` private, 20 MiB, 12 MIME types; exactly 2 `task_attachments_storage_*` policies (dev: identical).
- Trigger `on_auth_user_created` present and enabled; all v2 triggers `tgenabled='O'`.
- Behavioural smoke in the app as CTO / member / lead (the 6.6 suite): sign-up → pending → approve; deactivate ⇒ `/deactivated`; task/purchase/CAD create; cross-user isolation.

**After the import (6.8), expected row counts:**

| table | expected |
|---|---|
| `subsystems` | 7 (ids preserved verbatim) |
| `subsystem_categories` | 25 |
| `tasks` | 49 (`workspace_state`) **+ N** relational-only rows with a valid subsystem, where **imported + held = 69** (§9.12); N is computed at import time (≤ 20) |
| `timeline_columns` | 15 (keys `W1…W7, BREAK, W9…W15`; exactly 1 with `highlight = true`: `W3`) |
| `timeline_milestones` | 5 (all `W4`) |
| `recurring_events` | 1 (`day_of_week = 2`, `12:30`, `navy`) |
| `purchase_requests` / `_items` / `_status_history` | **0 / 0 / 0** initially — both orders are `chassis` ⇒ held as 2 `purchase_request_unmapped_subsystem` exceptions |
| `migration_exceptions` (unresolved) | ≥ 2 orders + the held tasks + people entries (assignees, leads, members, requester) + 1 `subteam_unmapped_subsystem` |
| `profiles` | 1 (importer) + real sign-ups |
| `notifications`, `audit_logs`, `calendar_events`, `milestones`, `competition_settings` | 0 (import is silent) |

Also: every `legacy_id` unique; `migration_log` covers every legacy row; no orphan FKs; every user trigger `tgenabled = 'O'` again; the old project's fingerprints unchanged.

---
## 12. Rollback strategy per stage (Q12)

| Situation | Mechanism | Verified |
|---|---|---|
| A file errors mid-run | each file runs in one transaction ⇒ that file leaves **no trace**; earlier files stay | yes — 0004 failed with 0001–0003 intact |
| Undo a whole install (pre-cutover, no user data) | `rollback/99_rollback_v2_schema.sql` — one transaction, drops exactly 27 tables, 35 functions, 10 enums, the auth trigger and 2 storage policies **by name, no CASCADE** | yes — replica returned identical to its pre-migration inventory (tables, columns, constraints, indexes, policies, functions, triggers, enums, publications). Not SQL-reversible: the empty `task-attachments` bucket (Supabase blocks DELETE on `storage.*`; remove in Dashboard) |
| Partial revert to stage N | run 99, re-apply files up to N | — (no per-file down scripts: they'd be error-prone; the install is additive) |
| ~~undo rename~~ (Path B only — **not used**, Path A chosen) | `rollback/00_undo_rename_legacy_tasks.sql` | kept for the record |
| Data import (6.8) | single transaction ⇒ all-or-nothing; legacy source never modified, so re-import is always possible; pre-cutover full rollback = 99 | design (6.8) |
| After users exist | 99 is **destructive** — restore from backup/PITR instead | — |
| Cutover | keep the legacy app on the untouched old project/tables until verified; rollback = redeploy previous app version | — |
| **Path A (chosen)** | nothing to undo in the old project (it is never written to); worst case, discard/ignore the new project | — |

---
## 13. Risks and blockers (status after the owner's decisions)

**Resolved**
- **B1** `public.tasks` collision — **resolved by Path A** (clean target project). No production table is renamed or altered.
- **B3** reconciliation unknowns — **resolved by script 03** (order statuses, `highlight`, rule checks; 49 tasks pass every rule).
- **D3** task source of truth — **decided:** union, `workspace_state` wins (§9.4, §9.12).
- **D4** unmapped subsystem ids — **decided:** keep as exceptions with the full record, resolve later, never guess (§9.12).
- **R6** dev-vs-reference equality — **verified:** the real bobcat-dev inventory is identical to the migrations reference in every migration-owned section (§2).

**Remaining blockers for the import (Phase 6.8 entry, not for finishing 6.7)**
- **B2** No profile exists to attribute NOT NULL `created_by`/`requested_by`/`changed_by`/`updated_by` ⇒ in the **new** project: first CTO signup + promotion (§8) before any import.
- **B4** The new Supabase project must be created and Auth configured (Dashboard actions only a human can do).
- **Q-A** (clarification, not a blocker) `fabrication` and `sae-deliverables` are in the source but not among the five destination areas (§9.12). Default: imported as-is, nothing dropped.
- **Open checks:** relational rows' categories/deadlines are rule-checked at import time (a category not in its subsystem ⇒ `category_id` NULL + `task_invalid_category` exception; `05_tasks_side_by_side_readonly.sql` gives a human review copy, optional now); the recurring event's day-of-week convention (0 = Sunday) to confirm against the legacy UI.

**Risks**
- **R1 (security, pre-existing, old project)** Every legacy table is world-readable **and writable** with the public key, and `taxonomy[].leadPin` (7 plaintext 4-digit PINs) sits in that public table. Not changed (rule: don't modify legacy). Path A keeps v2 out of that exposure. Recommend: treat the PINs as compromised/retired, never migrate them, and decide separately, after cutover, how to close the old project's policies.
- **R2** Source drift: legacy is anon-writable ⇒ fingerprint baseline (§10 #6) re-checked immediately before the import.
- **R3** SQL Editor atomicity is assumed, not proven on Supabase ⇒ always wrap each file in explicit `begin/commit` (proven in rehearsal).
- **R4** Rehearsals used PGlite + a Supabase stub (validates SQL order/syntax/inventory/rollback, not Supabase-managed behaviour); the real bobcat-dev result independently confirms the chain on Supabase. `postgres` must own the new tables to `DISABLE TRIGGER` — same role that creates them.
- **R5** Auth is dashboard config (email confirmation, redirects) and can block the first CTO login.
- **R7** `audit_logs` stays empty: **no writer exists** (no insert grant, no trigger). Not implemented (per instruction). Where to add later: (a) `admin_set_user_role/approved/active` (0020) — the natural first writers; (b) purchase/CAD approval transitions; (c) task status/owner changes; a `SECURITY DEFINER` insert helper or triggers plus a new migration.
- **R8** Attribution loss: legacy creators/timestamps don't exist ⇒ imported rows are attributed to the importer with raw legacy text preserved.
- **R9** Bucket removal and 0017's bucket upsert are outside SQL rollback / covered by pre-flight check #5.
- **R10** Legacy people-to-account matching is manual (exceptions) — an admin task, not automatable safely.
- **R11** 14 of 24 trigger functions keep default PUBLIC EXECUTE — accepted, not callable directly.
- **R12** The Admin "Resolve/Ignore" buttons on exceptions only change status (§9.12 caution) — a process risk for the `*_unmapped_subsystem` rows.
- **R13** Cross-project data transport is a pasted `jsonb` literal (size ≈ tens of KB, fine); it must be generated from the fingerprint-verified source.

## 14. Phase 6.8 entry criteria (Phase 6.8 has **not** been started)
1. New project created and Auth configured; `01`/`04` run on it (`all_clear: true`).
2. 0001–0021 applied per §4 and verified per §11 (identical to bobcat-dev in all migration-owned sections).
3. First CTO active in the new project (B2); importer id recorded.
4. Decisions D3/D4 are **recorded** (this document); clarification Q-A answered or accepted as "import as-is".
5. Fresh drift check against the fingerprint baseline (§10 #6).
6. Only then write and rehearse the import SQL (with the trigger-disable list of §9 and the exception design of §9.12) against a scratch replica, and run it in the new project.

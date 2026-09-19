# Phase 6.7 — Production schema preparation plan

> **Amended 2026-09-19 — target environment changed: bobcat-dev is promoted to the NEW LIVE production database.** The old live Supabase project is
> a read-only legacy source/fallback and stays completely untouched. Test data and accounts in bobcat-dev must be cleaned first (§15). Nothing has been
> deleted, imported or cut over. Phase 6.8 has not started. (§0, §3, §8, §10–§15 were rewritten for this; earlier "new project" wording is superseded.)

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
## 0. Executive summary — owner decisions (2026-09-18, **amended 2026-09-19: bobcat-dev becomes the live database**)

**Final environment plan (owner, 2026-09-19)**

| environment | role | rule |
|---|---|---|
| **OLD LIVE SUPABASE** | legacy source database; fallback/reference | **completely untouched** — never rename, delete or modify `workspace_state`, `orders`, `subteams`, legacy `tasks` or anything else. Read-only `SELECT`s only. |
| **BOBCAT-DEV** | **becomes the new live production database** | keep the verified 0001–0021 schema, RLS, functions, triggers, policies, indexes and storage configuration exactly as they are; the real legacy data is imported **into this project**. |
| **FUTURE TESTING** | a separate test environment, only if needed later | a **new** Supabase project will be created for that purpose **later — not now**. |

**Decisions approved by the project owner**
1. **Target = bobcat-dev, promoted to live** (supersedes the earlier "Path A: separate new project"). The rename pre-step and the earlier
   Path B stay rejected; `prestep/00…` and `rollback/00…` are records only and are **not used**.
2. **D3 — import the union of the two legacy task datasets, `workspace_state` winning on overlapping ids** (§9.4, §9.12).
3. **D4 — unresolved legacy records are migrated later, not guessed now.** Rows whose subsystem the source data does not establish
   (`chassis`, `brakes`, `rear-suspension`) are kept as **`migration_exceptions` carrying the full legacy record** (§9.12).
4. **All 7 source subsystems are kept** for the initial migration, including Fabrication and SAE Deliverables/Costing (real legacy data).
   **Drivetrain, Rear Suspension, Front Suspension, Pedals, Shielding are the areas to emphasize** and the target set for any later mapping.
   They may be reorganized or archived later (§9.12, Q-A answered).

**State of the evidence**
1. The old live project is a **legacy 4-table project** (`orders`, `subteams`, `tasks`, `workspace_state`; 0 auth users). Every legacy table
   is readable **and writable** with the public key (R1). It is **read-only source data**.
2. **The schema chain is verified twice:** 0001–0021 apply cleanly to a clean database (rehearsal), and the **real bobcat-dev inventory is
   identical to that reference in every migration-owned section** (tables, columns, 120 column ACLs, 87 indexes, 94 constraints, 10 enums,
   88 policies, bucket) — §2. Nothing in §4 needs to be applied again: **bobcat-dev already has 0001–0021.**
3. **bobcat-dev is not clean.** It holds everything Phases 6.1–6.6 created: **3 test auth accounts** (`*@bobcat-test.dev`, with
   passwords that were shared in chat), test subsystems and rows in every application table, and 2 storage objects. That must be removed
   **before the real import and before anyone relies on this database** — see the inventory, keep-list and cleanup plan in **§15**.
   **Nothing has been deleted.**
4. Data is tiny: 49 `workspace_state` tasks (+30 in a separate relational table), 7 subsystems, 25 categories, 15 timeline columns,
   5 milestone cells, 1 recurring event, 2 orders, 1 subteam.
5. The reconciliation data settled the mapping: order statuses (`Requested`→Submitted, `Arrived in Shop`→identical); timeline
   `highlight` (`none`→false, `emerald`→true) and the odd key `BREAK` (label `W8`); all 49 `workspace_state` tasks pass every
   new-schema rule; deadlines are 42 blank + 7 ISO dates.
6. Migration **0021 is in the chain** (`profiles.active` defaults to `true`; a usable account needs `approved = true`; CTO needs `role = 'cto'`).

**Still open (all are Phase 6.8 entry items):** run the bobcat-dev inventory (`06_…`), owner approval of the cleanup list, the cleanup itself,
first-CTO check on the owner's existing account (§8), Auth hardening for a live system (§10), then the import. Nothing was applied anywhere in
Phase 6.7 or in this planning step. **Phase 6.8 (the import) has not been started; no cutover has been started.**

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
| **CONFLICT** | `public.tasks` (and its index/constraint name `tasks_pkey`, and the row type `tasks`) | only against the **old** project — **does not arise under Path C** (bobcat-dev has no legacy tables, §3); nothing is renamed |
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
`storage.buckets` succeeded on dev with those triggers present (dev shows the bucket with identical limits). Under Path C bobcat-dev *is* the target, so these extras are simply part of the live baseline (a future test project would be expected to look like dev).

---
## 3. Decision record — target environment: **promote bobcat-dev (amended 2026-09-19)**

| | Path A — new project (**superseded**) | **Path C — promote bobcat-dev (CHOSEN)** | Path B — rename legacy `tasks` (rejected) |
|---|---|---|---|
| The `public.tasks` collision | none | **none** — bobcat-dev has no legacy tables | resolved by rename |
| Migrations to apply | 0001–0021 | **none — already applied and verified identical to the reference** | 0001–0021 + pre-step |
| Old live project | untouched | **untouched** | modified (rename) |
| Extra work | create + configure a project | **remove Phase 6.1–6.6 test data/accounts first (§15)** | — |
| Testing after go-live | dev stays a test project | **no test environment until a new project is created (later)** | — |

**What changes under Path C (compared with the earlier plan)**
- §4 (migration order) is **not executed**; it remains the verified reference and the procedure for a *future* test project.
- `04_preflight_checks_readonly.sql` is **not applicable** to bobcat-dev (it verifies that target objects do *not* exist yet; here they exist by design).
  Its role is replaced by "01 inventory identical to the reference" (§10, §11).
- **`rollback/99_rollback_v2_schema.sql` must never be run on bobcat-dev** — it would drop the live schema. It now refuses to run unless
  the session first sets an explicit confirmation (`app.confirm_rollback_v2`), tested; it is for a throw-away test project only.
- **The database used for RLS/regression testing becomes the live database.** From the moment real data is imported, no test accounts, test
  rows or destructive tests may be created in bobcat-dev. Phase-6.6-style testing needs the future test project (R14).
- `.env.local` (git-ignored) already points the app at bobcat-dev, so the live app and this project are the same project — no key changes needed
  (the publishable key is unchanged; **a service-role key is never used**).

### Path C operating model
1. **Freeze** bobcat-dev: nobody signs up or creates test data; optionally turn off "Allow new users to sign up" while cleaning.
2. **Inventory** (`06_inventory_dev_data_readonly.sql`, read-only) → `results/dev_06_data_inventory.json`; re-run `01_…` for a fresh schema baseline.
3. **Classify** every row/account as *disposable* or *keep*; the owner approves the list in writing (§15).
4. **Clean up** (only after approval): application data → storage objects → the 3 test auth users (§15 steps).
5. **Verify**: schema identical to the reference; every application table empty except the owner's profile; 1 auth user; bucket + policies intact.
6. **First CTO** = the owner's existing account (§8) and **Auth hardening** for a live system (§10).
7. **Import** the legacy data (Phase 6.8 — not started), with the exception design of §9.12.

**Moving the legacy data:** the OLD project is read with a read-only `SELECT` returning the legacy rows as one JSON value; that JSON is pasted as a
dollar-quoted `jsonb` literal into the import script and run in **bobcat-dev's** SQL Editor. No staging table, no cross-project connection, no
credentials, and the old project is never written to.

Everything below applies to Path C. (Path A / B notes that no longer apply were removed from the checklists.)

---
## 4. Migration order (Q11) — exact, per-file, atomic

> **Path C (2026-09-19): nothing in this section is executed.** bobcat-dev already has 0001–0021 applied and verified identical to the reference.
> This section is retained as the verified reference and as the procedure for a **future test project** (§3). Any *new* migration after go-live is a
> change to the live schema and needs its own plan, rehearsal and approval.

Apply **one file at a time** in the SQL Editor, wrapped in `begin; … commit;` (the rehearsal ran every
file that way; a failure rolls that file back completely). Never skip or reorder; 0021 stays last.

| Stage | Files | New-schema objects after the stage (tables / functions / triggers / policies / enums / indexes / buckets) |
|---|---|---|
| **0 pre-flight** | **Path C: not executed.** bobcat-dev already contains 0001–0021 (verified identical to the reference), so `04_preflight_checks_readonly.sql` would *correctly* report everything as "already exists". For a future test project: `01_…` baseline, then `04_…` ⇒ `all_clear: true` | — |
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

- **The OLD project has 0 auth users ⇒ no auth or profile data to migrate.** Legacy "identity" is free text (assignee, lead,
  members[], requested_by) plus lead PINs. (bobcat-dev, the new live target, has 4 accounts — 1 to keep, 3 disposable — see §15.)
- Trigger `on_auth_user_created → handle_new_user` (0001, hardened 0014) creates a profile for every future
  sign-up: `approved=false, active=true, role='member'`. Because production has no users, installing it
  before any user exists needs **no backfill**.
- Legacy people become real accounts by signing up and being approved through the app. Their legacy names
  are preserved as raw text (`tasks.legacy_assignee_raw`) and as `migration_exceptions` for an admin to resolve.

## 8. First production CTO/Admin (blocker B2) — using the owner's existing bobcat-dev account

bobcat-dev already has **one non-test auth account (`*@quinnipiac.edu`)** alongside the 3 disposable `*@bobcat-test.dev` accounts. That account is the
intended **first live admin/CTO**. Script `06_…` (2026-09-19) confirms it is **role `admin`, approved, active**.

1. It **must be kept** by the cleanup (§15).
2. **`admin` is already sufficient**: every CTO-level gate in the schema (`is_cto_or_admin()`, the purchase-approval and CAD-manufacturing gates, the 0020 admin RPCs,
   the Admin pages) accepts `cto` **or** `admin`. Promote to `cto` only if the owner wants that title — a human SQL statement, not needed for the migration:
   ```sql
   update public.profiles set approved = true, active = true, role = 'cto' where email = '<owner-email>';
   ```
   (0021 makes `active = true` mandatory for a usable account; `profiles.role/approved/active` have no API write grant — SQL or the 0020 RPCs only.)
3. Sign in to the app and confirm `/admin` loads. **This profile's uuid is the importer id** for Phase 6.8 (all imported rows are attributed to it).
4. Rotate this account's password if it has ever been shared or reused in testing (it is the most privileged account of the live system).

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

**Q-A — ANSWERED by the owner: keep all 7 subsystems for the initial migration.** The source taxonomy has **seven** subsystems; two are not among the
five emphasized areas — `fabrication` (Fabrication & Vehicle Integration; 2 `workspace_state` tasks, 4 categories) and `sae-deliverables` (SAE Deliverables & Costing;
5 `workspace_state` tasks + 4 relational, 3 categories). They contain real legacy data, so **both are imported as ordinary, active subsystems with all their
tasks and categories; nothing is deleted, dropped, archived or re-homed in the initial migration.** They may be reorganized or archived **later**, by an
explicit owner decision (`subsystems.active = false` is the archive path — archive-over-delete, no data loss).

**The five areas are an emphasis, not a filter.** Drivetrain, Rear Suspension, Front Suspension, Pedals and Shielding are the areas the owner wants to
emphasize, and remain the intended targets when the held `*_unmapped_subsystem` exceptions are later mapped. They do not change which subsystems, tasks,
categories or timeline rows are imported: the initial migration creates **all 7** subsystems exactly as the source taxonomy defines them.

---
## 10. Pre-flight checklist (before ANY change) — Path C (bobcat-dev becomes live)

1. **Schema baseline:** re-run `01_inspect_schema_readonly.sql` on bobcat-dev and compare with `results/dev_01_inventory.json` (taken 2026-09-18 15:54 UTC) **and** with
   the reference — identical in every migration-owned section (proves nothing drifted since the Phase 6.7 comparison).
2. **Data baseline:** run `06_inventory_dev_data_readonly.sql` on bobcat-dev → `results/dev_06_data_inventory.json` (`node tools/check_results.mjs` validates it).
3. **Approved classification:** the owner has approved, in writing, exactly which rows/accounts are deleted and which are kept (§15). Nothing is deleted before this.
4. **Backups:** confirm what the bobcat-dev plan offers (daily backups / PITR). The disposable test data needs no backup (the `06_` snapshot is kept as the record);
   **after** the real import, backups are what protects the live data (R15).
5. **Auth hardening for a live system** (Dashboard settings, not SQL — review each; bobcat-dev has only ever been configured for development):
   Site URL = the live app URL; redirect allow-list **without** `localhost`/test URLs; decide the sign-up policy (open sign-up is safe only because new accounts are
   `approved = false` and RLS blocks them until an admin approves); email confirmation on; a **production SMTP** provider (the default Supabase mailer is rate-limited and
   meant for development); password strength / leaked-password protection; anonymous sign-ins off (dev inventory shows none); reasonable session/JWT lifetimes;
   the 3 test accounts removed (§15).
6. Migration files on the commit being relied on match the rehearsed set (record `git rev-parse HEAD`). **No migration is applied** under Path C.
7. **Before the import (6.8):** re-run `01_…` on the OLD project and compare with `results/prod_01_inventory.json` (schema drift) and re-run `03_…` comparing
   `fingerprints` (the legacy tables are anon-writable ⇒ data can change). **Baseline captured 2026-09-18 from `prod_03` (hashes only, no content):**

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
8. Export the legacy data offline (SELECT → JSON): `workspace_state`, `tasks`, `orders`, `subteams` (this is also the import payload).
9. The OLD project is only ever read. No write, rename or delete is issued against it at any step.

## 11. Verification checklist

**Schema (before cleanup, after cleanup, after import — it must never change):** `node tools/compare_inventory.mjs <fresh 01 inventory> results/dev_01_inventory.json now baseline`
shows **no difference in any migration-owned section** (tables, columns, column ACLs, indexes, constraints, enums, functions, triggers, policies, bucket) — and the same
against the Phase 6.7 reference. Tolerated: row estimates and auth counts. Supabase-managed extras already in bobcat-dev are part of the baseline (function `public.rls_auto_enable()` +
event trigger `ensure_rls`, extra `storage.*` bucket-protection triggers, extensions `pg_stat_statements` / `supabase_vault` / `uuid-ossp`).
- 27 tables all `rls=true`; RPC functions `EXECUTE` only for `authenticated`; **no** `anon` grant on any v2 table (column ACLs = 120).
- Bucket `task-attachments` private, 20 MiB, 12 MIME types; exactly 2 `task_attachments_storage_*` policies.
- `on_auth_user_created` present and enabled; every v2 user trigger `tgenabled = 'O'`.

**After the cleanup (§15), before the import:**

| check | expected |
|---|---|
| `06_…` re-run: `row_counts` | **0 in every table except `profiles = 1`** |
| `auth_users` | **1** (the owner's `*@quinnipiac.edu` account; role `cto`, approved, active) |
| storage | 0 objects; bucket `task-attachments` and its 2 policies still present |
| leftovers | no auth user / profile / application row mentioning `bobcat-test.dev`; no `test-*` / `chunk4-*` subsystem |
| deleted accounts | signing in with the old test credentials **fails** (checked by a human) |
| app smoke (as the owner CTO) | `/dashboard`, `/tasks`, `/purchasing`, `/cad`, `/calendar`, `/timeline`, `/subsystems`, `/admin/*` render their **empty states** without errors |

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
| `profiles` | 1 (the owner/importer) + real sign-ups |
| `notifications`, `audit_logs`, `calendar_events`, `milestones`, `competition_settings` | 0 (import is silent) |

Also: every `legacy_id` unique; `migration_log` covers every legacy row; no orphan FKs; every user trigger `tgenabled = 'O'` again; the OLD project's fingerprints unchanged.

---
## 12. Rollback strategy per stage (Q12)

| Situation | Mechanism | Verified |
|---|---|---|
| A file errors mid-run | each file runs in one transaction ⇒ that file leaves **no trace**; earlier files stay | yes — 0004 failed with 0001–0003 intact |
| Undo a whole install (pre-cutover, no user data) | `rollback/99_rollback_v2_schema.sql` — one transaction, drops exactly 27 tables, 35 functions, 10 enums, the auth trigger and 2 storage policies **by name, no CASCADE** | yes — replica returned identical to its pre-migration inventory (tables, columns, constraints, indexes, policies, functions, triggers, enums, publications). Not SQL-reversible: the empty `task-attachments` bucket (Supabase blocks DELETE on `storage.*`; remove in Dashboard) |
| Partial revert to stage N | run 99, re-apply files up to N | — (no per-file down scripts: they'd be error-prone; the install is additive) |
| ~~undo rename~~ (Path B only — **not used**) | `rollback/00_undo_rename_legacy_tasks.sql` | kept for the record |
| Data import (6.8) | single transaction ⇒ all-or-nothing; legacy source never modified, so re-import is always possible; pre-cutover full rollback = 99 | design (6.8) |
| After users exist | 99 is **destructive** — restore from backup/PITR instead | — |
| Cutover | keep the legacy app on the untouched old project/tables until verified; rollback = redeploy previous app version | — |
| **Path C (chosen) — the old project** | nothing to undo: it is never written to and stays the fallback/reference source | — |
| **Path C — the test-data cleanup (§15)** | irreversible by design once committed (the data is disposable); protected by the approval gate, a precondition on exact counts and post-condition assertions; the `06_` snapshot is the record | rehearsed on scratch |
| **Path C — bobcat-dev is live** | **`99_rollback_v2_schema.sql` must NEVER be run on it** (drops the live schema; now guarded by a required confirmation setting, tested). After the real import the safety nets are the import's own transaction/`migration_log` batch and the project's **backups/PITR** (R15) | guard tested |

---
## 13. Risks and blockers (status after the 2026-09-19 decision)

**Resolved**
- **B1** `public.tasks` collision — **does not exist under Path C** (bobcat-dev has no legacy tables); no production table is renamed or altered.
- **B3** reconciliation unknowns — resolved by script 03. **D3**, **D4**, **Q-A** — decided (§9.4, §9.12).
- **R6** dev-vs-reference equality — verified: real bobcat-dev == migrations reference in every migration-owned section.
- **B4** "create a new project" — **no longer needed** (bobcat-dev is the target).

**Remaining blockers for the import (Phase 6.8 entry)**
- **B5 — bobcat-dev must be cleaned first.** It holds Phase 6.1–6.6 test accounts and data (§15). Needs: the `06_` inventory, the owner's approval of the delete list, and the cleanup itself.
- **B2 — first CTO:** the owner's existing `*@quinnipiac.edu` account must be `cto` / approved / active and is kept by the cleanup (§8).
- **Auth hardening** for a live system (§10 #5) — Dashboard settings a human must review.
- **Open checks:** relational rows' categories/deadlines are rule-checked at import time (a category not in its subsystem ⇒ `category_id` NULL + `task_invalid_category` exception); the recurring event's day-of-week convention (0 = Sunday) to confirm against the legacy UI.

**Risks**
- **R1 (security, pre-existing, OLD project)** Every legacy table is world-readable **and writable** with the public key, and `taxonomy[].leadPin` (7 plaintext 4-digit PINs) sits in that public table. Not changed (rule: don't touch the old project). Recommend: treat the PINs as compromised/retired, never migrate them, and decide separately, after cutover, how to close the old project's policies.
- **R2** Source drift: legacy is anon-writable ⇒ fingerprint baseline (§10 #7) re-checked immediately before the import.
- **R3** SQL Editor atomicity is assumed, not proven on Supabase ⇒ wrap every destructive/import script in explicit `begin/commit` with post-condition assertions (rehearsed).
- **R4** Rehearsals used PGlite + a Supabase stub (validates SQL order/syntax/inventory/rollback/cleanup order, not Supabase-managed behaviour); the real bobcat-dev result independently confirms the schema on Supabase.
- **R7** `audit_logs` stays empty: **no writer exists** (no insert grant, no trigger). Not implemented (per instruction). Where to add later: (a) `admin_set_user_role/approved/active` (0020) — the natural first writers; (b) purchase/CAD approval transitions; (c) task status/owner changes; a `SECURITY DEFINER` insert helper or triggers plus a new migration.
- **R8** Attribution loss: legacy creators/timestamps don't exist ⇒ imported rows are attributed to the importer with raw legacy text preserved.
- **R10** Legacy people-to-account matching is manual (exceptions) — an admin task, not automatable safely.
- **R11** 14 of 24 trigger functions keep default PUBLIC EXECUTE — accepted, not callable directly.
- **R12** The Admin "Resolve/Ignore" buttons on exceptions only change status (§9.12 caution).
- **R13** Cross-project data transport is a pasted `jsonb` literal (tens of KB) generated from the fingerprint-verified source.
- **R14 (new) The live database used to be the test database.** Every Phase-6.x test (RLS probes, deactivation tests, admin flows) ran against bobcat-dev. After go-live, no test account, probe row or destructive test may touch it; further testing needs a **separate test project, to be created later (not now)**.
- **R15 (new) Cleanup is irreversible.** After the cleanup transaction commits the test data is gone (the `06_` snapshot is the only record; nothing in it is worth restoring). After the real import, **backups/PITR are the only safety net** — confirm the plan's backup capability before importing (§10 #4).
- **R16 (new) Disposable accounts carry a real privilege.** `cto1@bobcat-test.dev` is a CTO account with a password that was pasted into chat; `lead1`/`member1` likewise. On a live database these are credentials to admin functions — they must be **deleted, not merely re-passworded**, before any real data or user exists.
- **R17 (new) Storage cannot be cleaned with SQL.** Supabase blocks direct `DELETE` on `storage.objects`/`storage.buckets` (`protect_*_delete`); the 2 test files must be removed from the Dashboard/Storage API, and the bucket + its 2 policies must **stay**.
- **R18 (new) `rls_auto_enable()` / `ensure_rls` and the extra storage triggers are Supabase-managed** items that live in bobcat-dev but not in the old project — part of the baseline, not something to remove.
- **R19 (new) The rollback script is now a live-database hazard.** `rollback/99_rollback_v2_schema.sql` drops all 27 tables. It refuses to run without an explicit session confirmation (tested); it must never be run on bobcat-dev.

## 14. Phase 6.8 entry criteria (Phase 6.8 has **not** been started; no cutover has been started)
1. `01` re-run on bobcat-dev is identical to the baseline/reference (§10 #1); `06` inventory saved and validated (§10 #2).
2. The owner has approved the delete/keep list (§15) in writing.
3. Cleanup executed and verified per §11 (only the owner's profile remains; 1 auth user; 0 storage objects; schema unchanged).
4. The owner's account is the active CTO (§8); its password rotated; the 3 test accounts are gone.
5. Auth hardened for a live system (§10 #5); backups/PITR capability known (§10 #4).
6. Decisions D3/D4/Q-A are recorded and owner-approved (this document).
7. Fresh drift check of the OLD project against the fingerprint baseline (§10 #7).
8. Only then write and rehearse the import SQL (trigger-disable list of §9, exception design of §9.12) and run it in bobcat-dev.

## 15. bobcat-dev promotion — inventory, keep-list and cleanup plan

**Status: PLANNING ONLY. Nothing has been deleted, changed or imported.** Evidence so far comes from `results/dev_01_inventory.json`
(catalog inventory taken 2026-09-18 15:54 UTC: schema, planner row *estimates*, auth summary, storage counts) plus what Phases 6.1–6.6 are known to have created.
The **exact, row-level** inventory is produced by `06_inventory_dev_data_readonly.sql` (read-only; validated on a fixture with data in every table) and must
be run before any classification is final.

### 15.1 Auth users (bobcat-dev) — 4
| account | count | classification | why |
|---|---|---|---|
| `*@quinnipiac.edu` (1, email/password, confirmed; created 2026-09-16 03:26 UTC, before the test accounts) | 1 | **KEEP — the owner's real account** (confirmed by script 06: role **`admin`**, approved, active, no subsystem memberships) | the intended first live admin/CTO (§8); the only non-test account |
| `member1@bobcat-test.dev`, `lead1@bobcat-test.dev`, `cto1@bobcat-test.dev` | 3 | **DISPOSABLE** | created in Phases 6.x for RLS/browser testing; the owner declared them disposable; passwords were shared in chat (R16) |

### 15.2 Application tables — rows (`06_` inventory, 2026-09-19: **exact counts equal these planner estimates — 229 rows in 27 tables**)
| table | est. rows | classification | evidence / note |
|---|---|---|---|
| `subsystems` | 3 | disposable | the test ids seen in Phase 6.6: `test-suspension`, `test-drivetrain`, `chunk4-test-brakes` (real ones come from the legacy import) |
| `subsystem_members` | 4 | disposable | all four memberships involve the test accounts (cto1 / lead1 ×2 / member1) |
| `subsystem_categories` | 11 | disposable | test categories incl. the Phase 6.6 probe category |
| `tasks` | 23 | disposable | test tasks (e.g. "Machine rear upright", the Phase 6.6 "probe" task) |
| `task_assignees` / `task_requests` / `task_comments` / `comment_mentions` | 5 / 13 / 14 / 12 | disposable | created by the test accounts; incl. Phase 6.6 request probes |
| `task_attachments` | 7 | disposable | **only 2 storage files exist ⇒ ≥ 5 are metadata-only stubs with no file** |
| `purchase_requests` / `_items` / `_status_history` | 11 / 2 / 35 | disposable | test purchases (e.g. "Wheel bearings") and their generated history |
| `cad_reviews` / `_versions` / `_comments` | 18 / 13 / 6 | disposable | test reviews (e.g. "Frame gusset (lead submission)"; the stale "Upright bracket v1" with `current_revision = 0`) |
| `calendar_events` / `recurring_events` / `milestones` | 3 / 2 / 2 | disposable | test entries |
| `timeline_columns` / `timeline_milestones` | 6 / 2 | disposable | test grid; the real 15 columns / 5 cells come from the import |
| `competition_settings` | 5 | disposable — **review** | test seasons; real values are entered later by the CTO (owner may have entered a real one — `06_` shows) |
| `notifications` | 19 | disposable | generated by triggers from test activity |
| `member_applications` | 6 | disposable | test applications incl. review-flow tests |
| `migration_exceptions` | 3 | disposable | Phase 6.4 exception-panel tests (`migration_log` = 0, `audit_logs` = 0) |
| `profiles` | 4 | 3 disposable, **1 keep** | mirrors the auth users |
| `storage.objects` (`task-attachments`) | 2 | disposable | test uploads (5 more attachment rows have no file) |

### 15.3 Classification rules (applied row by row to the `06_` output)
1. Anything created by, owned by, assigned to, mentioned, or attributed to a `@bobcat-test.dev` account ⇒ **disposable**.
2. Anything created by the owner's real account ⇒ **HOLD for the owner's decision** (it could be a manual test or a real entry) — never auto-deleted.
3. Configuration/seed rows (subsystems, categories, timeline, competition, recurring events, milestones) ⇒ disposable **unless** the owner marks a row as real; the real ones are imported from the legacy data.
4. Orphans (attachment rows with no file, exceptions, notifications) ⇒ disposable.
5. Ambiguity is resolved toward **keeping** until the owner decides; nothing is deleted on inference.

### 15.4 What MUST remain (part of the verified schema/setup)
- **All schema objects:** 27 tables, 10 enums, 35 functions, 39 triggers (38 public + `on_auth_user_created`), 88 policies (86 public + 2 storage), 120 column ACLs, 87 indexes, 94 constraints, every grant.
- **Storage:** bucket `task-attachments` (private, 20 MiB, 12 MIME types) and its 2 `storage.objects` policies — only the 2 test *files* go.
- **Supabase-managed items:** `public.rls_auto_enable()` + event trigger `ensure_rls`, the bucket-protection triggers, extensions, default privileges, the realtime/`supabase_*` schemas.
- **Auth project configuration** (URLs, providers, SMTP, JWT) — reviewed, not deleted (§10 #5).
- **The owner's auth user + profile** (and the `.env.local` URL/publishable key — unchanged).
- The `migration_log` / `migration_exceptions` / `audit_logs` **tables** (only test *rows* go); the import will use them.

### 15.5 Cleanup plan — steps and gates (nothing runs without the owner's written approval of step 3)
| # | step | how | gate |
|---|---|---|---|
| 0 | **Freeze** bobcat-dev | Dashboard: pause sign-ups; nobody creates test data | — |
| 1 | **Snapshot** | run `06_…` and `01_…` on bobcat-dev → `results/dev_06_data_inventory.json`, fresh `01` | `check_results.mjs` validates; `01` identical to baseline/reference |
| 2 | **Classify** | ✅ **done 2026-09-19** from `06_` (§15.8); re-run with `07_` output (§15.9) | every HOLD has a question for the owner — **15 HOLD + 67 DELETE\* awaiting the owner / script 07** |
| 3 | **Approve** | the owner approves the list and the keep-list in writing | **no deletion before this** |
| 4 | **Generate** the final cleanup SQL from the rehearsed order (§15.6) with a precondition (exact counts equal the approved snapshot ⇒ detects drift) and post-conditions | reviewed by the owner | dry-run counts match |
| 5 | **Delete application data** in one transaction (SQL Editor, `begin … commit`) | children-first order; assertions: only the owner's profile remains | any failed assertion ⇒ rollback, nothing deleted |
| 6 | **Delete the 2 storage files** | Dashboard → Storage → `task-attachments` (SQL is blocked by `protect_delete`); bucket stays | 0 objects |
| 7 | **Delete the 3 test auth users** | Dashboard → Authentication → Users (after step 5, so the RESTRICT foreign keys are gone); profiles cascade | 1 auth user left |
| 8 | **Verify** | §11 "after the cleanup" table; `01` identical to baseline; old test logins fail | all green |
| 9 | **Owner account & Auth hardening** | §8, §10 #5 | then, and only then, Phase 6.8 |

### 15.6 Deletion order (derived from the REAL bobcat-dev constraints: 46 public FKs, 15 of them RESTRICT / NO ACTION)
`audit_logs → cad_review_comments → cad_review_versions → cad_reviews → calendar_events → comment_mentions → member_applications → migration_exceptions → notifications → purchase_request_items → purchase_status_history → purchase_requests → subsystem_members → task_assignees → task_attachments → task_comments → task_requests → tasks → timeline_milestones → milestones → recurring_events → subsystem_categories → subsystems → timeline_columns → competition_settings → migration_log → [auth users, cascading `profiles`]`
(children first; `profiles` last because 13 tables reference it with RESTRICT).

### 15.7 Rehearsal evidence (scratch database — never bobcat-dev; `tools/rehearse_cleanup.mjs`)
- Migrations 0001–0021 applied; **every one of the 27 tables** filled with fixture data owned by 3 test accounts + 1 owner.
- `06_…` ran against the fixture: **exact `row_counts` equal the real counts**, and it flagged the attachment row that has no file.
- **The naive order fails** — deleting the test accounts first is blocked (`RESTRICT` foreign key on `profiles`).
- **The derived order succeeds in one transaction:** only `profiles = 1` (the owner, still cto/approved/active) and 1 auth user remain.
- **Schema identical before vs after** (all migration-owned sections) and **0 triggers disabled** afterwards.
- Also rehearsed: the rollback script's confirmation guard (refuses unconfirmed; restores a replica exactly when confirmed).
The final SQL (step 4) is deliberately **not** written yet: it is generated from the approved list, not before it.

### 15.8 The approval list (produced 2026-09-19 from `06_`; summary only — the row-by-row list with e-mails/titles is local: `results/dev_cleanup_classification.md`)
`node tools/classify_dev_cleanup.mjs` classifies **every** item — 229 table rows + 4 auth users + 2 storage files + the bucket = **236** — and checks that every counted row is covered.
Rules: **KEEP** = the owner's account; **HOLD** = names the owner's account (*direct*), or has no actor column but was created/updated inside the owner's demonstrated session window
2026-09-18 03:55–04:16 UTC (*probable*), or is a test row that cannot be deleted without destroying/altering a HOLD row (*dependency*); **DELETE** = test data; **DELETE\*** = test child row whose actor
fields were not in inventory 06 (see 15.9).

| table | rows | DELETE | DELETE\* | HOLD | KEEP |
|---|---|---|---|---|---|
| auth users / profiles | 4 / 4 | 3 / 3 | | | 1 / 1 |
| subsystems | 3 | 1 | | 2 | |
| subsystem_members | 4 | 4 | | | |
| subsystem_categories | 11 | 10 | | 1 | |
| timeline_columns / timeline_milestones | 6 / 2 | 3 / 1 | | 3 / 1 | |
| competition_settings | 5 | 5 | | | |
| recurring_events / milestones | 2 / 2 | 1 / 2 | | 1 / 0 | |
| calendar_events / migration_exceptions / member_applications | 3 / 3 / 6 | all | | | |
| tasks | 23 | 22 | | 1 | |
| task_assignees / task_requests / task_comments | 5 / 13 / 14 | 3 / 13 / 12 | | 2 / 0 / 2 | |
| comment_mentions / task_attachments | 12 / 7 | 7 (attachments) | 12 (mentions) | | |
| purchase_requests / _items / _status_history | 11 / 2 / 35 | 10 | 2 items + 34 history | 1 + 1 history | |
| cad_reviews / _versions / _comments | 18 / 13 / 6 | 18 | 13 + 6 | | |
| notifications | 19 | 19 | | | |
| storage objects / bucket | 2 / 1 | 2 | | | 1 (bucket) |
| **TOTAL** | **236** | **151** | **67** | **15** | **3** |

**The 15 HOLD items** (ids/titles only; each is a *test* artifact of the owner's own UI session on 2026-09-18 ~04:03–04:10 UTC):
| type | item |
|---|---|
| direct | 2 task comments by the owner (2 and 5 characters) on task "Phase 6.5 conversion test" |
| direct | purchase request "TESTING" (Draft) in subsystem `chunk4-test-brakes` (+ its 1 auto-generated status-history row) |
| direct | timeline cell `test-drivetrain / w2` "Sprocket order placed", last edited by the owner |
| probable | recurring event "Tech Meeting" (Tue 12:30, no colour) — **resembles the real legacy event** (same weekday/time), so the import would duplicate it |
| probable | timeline columns `t6e-w2-…` ("Week 2") and `t6e-w1-…` ("Week One (renamed)") — edited at 04:06 UTC |
| probable | category `G-cat-…271` under `test-drivetrain` — edited at 03:55 UTC |
| dependency | task "Phase 6.5 conversion test" (+ its 2 assignee rows), subsystems `test-drivetrain` and `chunk4-test-brakes`, timeline column `w2` |

**Consequences if the HOLD rows are kept:** the test account `lead1` **cannot be deleted** (it created the kept task, RESTRICT); deleting `member1` would **alter** the kept task (its primary owner is cleared and its
assignee rows cascade away). `lead1` is a team-lead account whose password was shared in chat (R16) — so keeping the HOLD rows leaves a known credential alive on the live database unless it is at least disabled (banned).

**Owner options:** (1) **recommended — approve deleting all HOLD rows** (they are all test artifacts): the database ends with only the owner's account; (2) keep some/all HOLD rows and accept the residue
(`lead1` remains, at minimum banned and its password reset; the listed subsystems/columns remain and must be cleaned later); (3) approve a subset. Nothing is deleted until the owner answers.

### 15.9 Gate: script 07 must be clean before approval (the 67 DELETE\* rows)
Inventory 06 only *counted* purchase status history (34), purchase line items (2), CAD versions (13), CAD comments (6) and comment mentions (12) and omitted the reviewer columns
(`reviewed_by` on purchases and task requests, `reviewer_id` on CAD reviews). `07_child_rows_actors_readonly.sql` (read-only, validated on the fixture) lists them row by row with actor e-mails.
**Any row that names the owner's account there moves from DELETE\* to HOLD; otherwise DELETE\* becomes DELETE.** Save as `results/dev_07_child_actors.json`; the classifier is re-run with it.

### 15.10 What has NOT been done
No row, account, file or setting in bobcat-dev was deleted or changed; nothing was imported; the old project was not touched; `workspace_state` was not touched; no cutover step was taken; Phase 6.8 has not started.

# Phase 6.7 — Production schema preparation plan

Status: **plan only. Nothing was applied to any Supabase project. `workspace_state` and every legacy
table were never modified.** Production was inspected read-only via the SQL Editor (scripts 01 and 02).

Evidence base: `results/prod_01_inventory.json` (production catalog inventory, 2026-09-18),
`results/prod_02_workspace_state_shape.json` (SELECT-only shape profile), `results/prod_03_reconcile.json`
(legacy reconciliation facts: ids, counts, enum-like values, fingerprints), the 21 migrations in
`supabase/migrations/`, and scratch rehearsals on an in-memory Postgres (PGlite) — see §12.
**Open evidence gap:** `results/dev_01_inventory.json` was still the untouched placeholder (132 bytes) when this plan
was finalized, so the "development schema" used below is the reference inventory produced by applying 0001–0021 to a
clean database, **not** a live bobcat-dev dump (§13, R6). This does not affect the production diff or the data mapping.

---
## 0. Executive summary

1. Production is a **legacy 4-table project**: `orders`, `subteams`, `tasks`, `workspace_state`. It has
   **0 auth users, 0 functions, 0 enums, 0 triggers, 0 storage buckets/objects**. Every legacy table has a
   `USING (true)` policy for role `public` (anon), i.e. anyone with the publishable key can read **and write** them.
2. **BLOCKER B1 — one hard collision.** Production already has `public.tasks` (text id, free-text
   assignee). Migration 0004 does `create table public.tasks`. Proven on a replica of the real production
   shape: unmodified 0001–0021 **fails at 0004** (`relation "tasks" already exists`) after 0001–0003 have
   committed. Nothing else collides.
3. The standing rule "do not drop or rename existing production tables" makes the schema **impossible to
   install in this project as-is**. Two ways forward; **a decision is required before Phase 6.8**:
   - **Path A (recommended): a separate v2 production Supabase project.** Zero collisions, legacy app and
     data untouched, trivial rollback (discard the project). The 0001–0021 chain is proven on a clean database.
   - **Path B: same project + rename `public.tasks` → `legacy_tasks`** (`prestep/00_rename_legacy_tasks.sql`).
     Proven to work, but it renames a production table (against the standing rule) and breaks any legacy
     code still reading `public.tasks`. Only with an explicit yes.
4. Data is tiny: 49 tasks (+30 in a separate relational table), 7 subsystems, 25 categories, 15 timeline columns,
   5 milestone cells, 1 recurring event, 2 orders, 1 subteam. With **0 auth users there is nothing to migrate for
   auth/profiles**, but that creates **BLOCKER B2**: `created_by` / `requested_by` / `changed_by` / `updated_by`
   are NOT NULL foreign keys to `profiles`, so a real, approved CTO profile must exist **before** any data import.
5. The reconciliation data (script 03, real results) settled the mapping questions and exposed two **human decisions**
   that gate the data import (Phase 6.8), **not** the schema install:
   - **Resolved:** order statuses (`Requested`→Submitted, `Arrived in Shop`→identical); timeline `highlight`
     (`none`→false, `emerald`→true) and the odd key `BREAK` (label `W8`); all 49 `workspace_state` tasks pass every
     new-schema rule; deadlines are 42 blank + 7 ISO dates.
   - **D3 — two divergent task datasets:** relational `tasks` (30) and `workspace_state.tasks` (49) share only 10 ids,
     and those 10 have already diverged (title 8, status 5, deadline 10, subsystem 1). A source-of-truth choice is needed (§9.4).
   - **D4 — legacy subsystem ids that do not exist:** `chassis` (4 tasks + both orders), `brakes` (1 task),
     `rear-suspension` (1 task + the subteam). They need an explicit mapping to one of the 7 subsystems (§9.12).
6. Migration **0021 is included** (last in the chain). `profiles.active` defaults to `true`, so the first
   CTO/admin only needs `approved = true` and `role = 'cto'` (§8).

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
| **CONFLICT** | `public.tasks` (and its index/constraint name `tasks_pkey`, and the row type `tasks`) | **Blocker B1** — Path A avoids it; Path B renames legacy |
| **ALTER** existing production objects | **none** (the migrations never alter a pre-existing production table) | — |
| **LEAVE ALONE** | `public.orders`, `public.subteams`, `public.workspace_state`, their policies, grants, realtime membership, all Supabase-managed schemas/triggers/extensions | never dropped, renamed or modified |
| Silent-overwrite risk (`create or replace function`) | production has **0** functions ⇒ none can be overwritten | — |
| Extension | 0002 `create extension if not exists pgcrypto` ⇒ no-op (already installed, schema `extensions`) | — |

The `04_preflight_checks_readonly.sql` query re-verifies all of the above on the day.

---
## 3. Decision required — how to resolve the `public.tasks` collision

| | **Path A — new v2 project (recommended)** | **Path B — same project, rename legacy `tasks`** |
|---|---|---|
| Collision | none | resolved by rename (proven) |
| Violates "don't rename production tables" | no | **yes** — needs explicit approval |
| Legacy app / `public.tasks` readers | untouched | **break** until updated |
| Legacy public-write exposure (§13 R1) | stays isolated in the old project | v2 tables live next to open tables in the same API |
| Rollback | ignore/delete the new project | `99_rollback…` + `00_undo_rename…` (proven) |
| Cost | new URL/keys + Auth/Storage config; legacy data read via SELECT → generated INSERTs | none beyond the rename |
| Migration set | 0001–0021 unchanged | 0001–0021 unchanged + `prestep/00` |

Not viable: installing v2 into another schema — every migration, function body and search_path hard-codes
`public`, and PostgREST exposed-schema changes would be needed. Same for altering legacy `tasks` in place
(ids text→uuid, columns dropped — destructive).

Everything below applies to both paths unless marked **[B only]**.

---
## 4. Migration order (Q11) — exact, per-file, atomic

Apply **one file at a time** in the SQL Editor, wrapped in `begin; … commit;` (the rehearsal ran every
file that way; a failure rolls that file back completely). Never skip or reorder; 0021 stays last.

| Stage | Files | New-schema objects after the stage (tables / functions / triggers / policies / enums / indexes / buckets) |
|---|---|---|
| **0 pre-flight** | `04_preflight_checks_readonly.sql` → must be `all_clear: true`; **[B only]** `prestep/00_rename_legacy_tasks.sql` first | — |
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

**Decision D3 — task source of truth**
| option | effect |
|---|---|
| 1. `workspace_state` only (49) | simplest; the 20 relational-only tasks are **not** carried into v2 (they stay in the untouched legacy table) |
| **2. Union, `workspace_state` wins on the 10 shared ids (recommended default)** | 39 + 10 from `workspace_state` = 49, **plus the 20 relational-only rows** = up to **69**. `workspace_state` is the later-written store. Nothing is silently dropped; each shared id is imported once (the relational version is logged `skipped`, "superseded"). Rows whose subsystem is unmapped (D4) or whose category is invalid become exceptions and are not imported until resolved. Caveat: the ids `t1…t17` look like early seed data — review with script 05 before accepting |
| 3. relational wins on the shared ids | not recommended (older store) |

### 9.5 purchase_requests + purchase_request_items ← `public.orders` (2)  (`workspace_state.orders` is empty)
Facts: ids `o1787624828935`, `o1787626195417`; statuses **Requested 1, Arrived in Shop 1**; urgency **Immediate Need ×2**;
subsystem **`chassis` ×2 (not in the taxonomy → D4)**; both have `vendor_url` and `part_number`; qty 2–4; **no zero/NULL prices**;
1 distinct requester (none blank); submitted 2026-08-25.

| new | from | rule |
|---|---|---|
| `purchase_requests.legacy_id` / `purchase_request_items.legacy_id` | `orders.id` | preserved |
| `title` | `item` | |
| `subsystem_id` | `subsystem_id` | `chassis` is not a v2 subsystem ⇒ **D4**; unresolved ⇒ exception, row **not** imported |
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

### 9.12 Decisions required from you before the import (Phase 6.8) — D3 and D4
**D3 — which task dataset is the source of truth** — see §9.4 (recommended default: union, `workspace_state` wins on the 10 shared ids).

**D4 — legacy subsystem ids that are not in the taxonomy.** `subsystems.id` is preserved from the taxonomy, and
`tasks.subsystem_id` / `purchase_requests.subsystem_id` are NOT NULL foreign keys, so these rows cannot be imported until
each unknown id is mapped to one of the 7 real subsystems. **The data does not say which; nothing is defaulted.**

| unknown legacy id | used by | candidates (from names only — a human must confirm) |
|---|---|---|
| `chassis` | 4 relational tasks, **both orders** | `fabrication` (Fabrication & Vehicle Integration)? — or another, the team knows |
| `brakes` | 1 relational task | `rear-suspension-brakes` (Rear Suspension & Rear Brakes)? `pedals-driver-controls` (brake pedal)? |
| `rear-suspension` | 1 relational task, the `subteams` row | `rear-suspension-brakes` |

Unresolved ⇒ those rows become `migration_exceptions` and are **not** imported: **both orders** and **up to 6 relational
tasks** (fewer if some of those 6 are among the 10 shared ids, where the `workspace_state` version — which uses real taxonomy
ids — wins under D3 option 2; script 05 shows exactly which). Everything in `workspace_state` (49 tasks, all categories,
timeline, recurring event) is unaffected by D4.

---
## 10. Pre-flight checklist (before ANY change)

1. `04_preflight_checks_readonly.sql` on the target ⇒ `all_clear: true` (fails on `tasks`/`tasks_pkey` for an
   un-renamed production project — expected).
2. Decision on Path A/B recorded. **[B only]** explicit approval for the rename; confirm nothing live reads `public.tasks`.
3. Re-run `01_…` and compare with `results/prod_01_inventory.json` (schema drift check) and re-run `03_…`
   comparing `fingerprints` (legacy tables are anon-writable ⇒ data can change). **Baseline captured 2026-09-18 from `prod_03`
   (hashes only, no content):**

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
4. Export legacy data (SELECT → JSON, saved offline): `workspace_state`, `tasks`, `orders`, `subteams`.
5. Confirm backup/PITR availability for the target project's plan.
6. Auth settings configured (Site URL, redirects, email confirmation/SMTP).
7. Migration files on the commit being applied match the rehearsed set (`git rev-parse` recorded).
8. Human present; one file per SQL Editor run, each wrapped in `begin; … commit;`.

## 11. Verification checklist

Per stage: run `01_…` and compare to §4 counts. After Stage G (before any data):
- `compare_inventory.mjs <target> <reference>`: **only** legacy objects differ ([B] legacy `tasks`→`legacy_tasks` + open policies/publications).
- 27 tables all `rls=true`; `select … from pg_proc` shows RPC functions `EXECUTE` only for `authenticated`; **no** `anon` grant on any v2 table (column ACLs = 120).
- Bucket `task-attachments` private, 20 MiB, 12 MIME types; exactly 2 `task_attachments_storage_*` policies.
- Trigger `on_auth_user_created` present and enabled; all v2 triggers `tgenabled='O'`.
- Behavioural smoke (in the app, as CTO/member/lead): sign-up → pending → approve; deactivate ⇒ `/deactivated`; task/purchase/CAD create; cross-user isolation. (Same 6.6 suite.)
After import (6.8), expected row counts:

| table | expected |
|---|---|
| `subsystems` | 7 |
| `subsystem_categories` | 25 |
| `tasks` | **49** (D3 option 1) or **up to 69** (option 2, recommended) — minus rows held back as exceptions by D4 (≤ 6 relational tasks) |
| `timeline_columns` | 15 (keys `W1…W7, BREAK, W9…W15`; exactly 1 with `highlight = true`: `W3`) |
| `timeline_milestones` | 5 (all `W4`) |
| `recurring_events` | 1 (`day_of_week = 2`, `12:30`, `navy`) |
| `purchase_requests` / `purchase_request_items` / `purchase_status_history` | 2 / 2 / 2 if D4 maps `chassis`; otherwise 0 |
| `profiles` | 1 (importer) + real sign-ups |
| `notifications`, `audit_logs`, `calendar_events`, `milestones`, `competition_settings` | 0 (import is silent) |

Also: every `legacy_id` unique; `migration_log` covers every legacy row; unresolved exceptions listed; no orphan FKs;
notification count unchanged; every user trigger `tgenabled = 'O'` again.

---
## 12. Rollback strategy per stage (Q12)

| Situation | Mechanism | Verified |
|---|---|---|
| A file errors mid-run | each file runs in one transaction ⇒ that file leaves **no trace**; earlier files stay | yes — 0004 failed with 0001–0003 intact |
| Undo a whole install (pre-cutover, no user data) | `rollback/99_rollback_v2_schema.sql` — one transaction, drops exactly 27 tables, 35 functions, 10 enums, the auth trigger and 2 storage policies **by name, no CASCADE** | yes — replica returned identical to its pre-migration inventory (tables, columns, constraints, indexes, policies, functions, triggers, enums, publications). Not SQL-reversible: the empty `task-attachments` bucket (Supabase blocks DELETE on `storage.*`; remove in Dashboard) |
| Partial revert to stage N | run 99, re-apply files up to N | — (no per-file down scripts: they'd be error-prone; the install is additive) |
| **[B only]** undo rename | `rollback/00_undo_rename_legacy_tasks.sql` after 99 | yes |
| Data import (6.8) | single transaction ⇒ all-or-nothing; legacy source never modified, so re-import is always possible; pre-cutover full rollback = 99 | design (6.8) |
| After users exist | 99 is **destructive** — restore from backup/PITR instead | — |
| Cutover | keep the legacy app on the untouched old project/tables until verified; rollback = redeploy previous app version | — |
| Path A | nothing to undo in the old project; discard the new one | — |

---
## 13. Risks and blockers

**Blockers**
- **B1** `public.tasks` collision ⇒ choose Path A or B (§3). *Blocks 6.8.*
- **B2** No profile exists to attribute NOT NULL `created_by`/`requested_by`/`changed_by`/`updated_by` ⇒ first CTO signup + promotion (§8) before import.
- **B3 — resolved by script 03:** order statuses, `highlight` semantics, category/subsystem consistency of the 49 `workspace_state` tasks (0 violations, so `tasks_before_write` cannot throw for them), non-ISO deadlines (none).
- **D3 (decision, blocks the task import)** two divergent task datasets: 30 relational vs 49 `workspace_state`, 10 shared ids that already disagree (§9.4). Recommended default: union, `workspace_state` wins. Review `05_tasks_side_by_side_readonly.sql` output first.
- **D4 (decision, blocks part of the import)** legacy subsystem ids `chassis` / `brakes` / `rear-suspension` are not in the taxonomy (§9.12). Blocks both orders and up to 6 relational tasks; does **not** block the 49 `workspace_state` tasks.
- **Open check:** relational rows' categories/deadlines are not yet rule-checked (script 05 does it); recurring-event day-of-week convention (0 = Sunday) to confirm against the legacy UI.

**Risks**
- **R1 (security, pre-existing)** Every legacy table is world-readable **and writable** with the public key, and `taxonomy[].leadPin` (7 plaintext 4-digit PINs) sits in that public table. Not changed here (rule: don't modify legacy). Recommend: treat PINs as compromised/retired, never migrate them, and restrict/close the legacy policies at cutover (a Phase 6.8+ decision).
- **R2** Source drift: legacy is anon-writable ⇒ fingerprints (script 03) re-checked at import time.
- **R3** SQL Editor atomicity is assumed, not proven on Supabase ⇒ always wrap files in explicit `begin/commit` (proven in rehearsal).
- **R4** Rehearsals used PGlite + a Supabase stub (validates SQL order/syntax/inventory/rollback, not Supabase-managed behaviour). `postgres` must own the tables to `DISABLE TRIGGER` — production tables are owned by `postgres`; verify for the new tables (created by the same role).
- **R5** Auth is dashboard config (email confirmation, redirects) and can block the first CTO login.
- **R6** `dev_01_inventory.json` is **still the untouched placeholder** (132 bytes): equality of live bobcat-dev with the migrations-derived reference is unverified. Cheap fix: run `01_…` on bobcat-dev, save the JSON to that file, then `node tools/check_results.mjs` and `node tools/compare_inventory.mjs results/dev_01_inventory.json <reference>`; only Supabase-managed objects should differ. It does not change the production diff or the data mapping.
- **R7** `audit_logs` stays empty: **no writer exists** (no insert grant, no trigger). Not implemented (per instruction). Where to add later: (a) `admin_set_user_role/approved/active` (0020) — the natural first writers; (b) purchase/CAD approval transitions; (c) task status/owner changes; a `SECURITY DEFINER` insert helper or triggers would be needed, plus a new migration.
- **R8** Attribution loss: legacy creators/timestamps don't exist ⇒ all imported rows are attributed to the importer with raw legacy text preserved.
- **R9** Bucket removal and 0017's bucket upsert are outside SQL rollback / need pre-flight #5.
- **R10** Legacy people-to-account matching is manual (exceptions) — an admin task, not automatable safely.
- **R11** 14 trigger functions with default PUBLIC EXECUTE — accepted, not callable directly.

## 14. Phase 6.8 entry criteria (not started)
1. Path A/B decided (B1) and target ready + Auth configured.
2. 0001–0021 applied and verified (§11); `04_…` was `all_clear` beforehand.
3. First CTO active (B2); importer id recorded.
4. **D3** (task source of truth) and **D4** (subsystem mapping) decided in writing; script 05 output reviewed.
5. Fresh drift check against the fingerprint baseline (§10 #3).
6. Only then write and rehearse the import SQL (with the trigger-disable list of §9) against a scratch replica.
(Phase 6.8 has **not** been started.)

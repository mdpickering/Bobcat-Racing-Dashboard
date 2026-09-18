# Phase 6.7 — Production schema preparation plan

Status: **plan only. Nothing was applied to any Supabase project. `workspace_state` and every legacy
table were never modified.** Production was inspected read-only via the SQL Editor (scripts 01 and 02).

Evidence base: `results/prod_01_inventory.json` (production catalog inventory, 2026-09-18),
`results/prod_02_workspace_state_shape.json` (SELECT-only shape profile), the 21 migrations in
`supabase/migrations/`, and scratch rehearsals on an in-memory Postgres (PGlite) — see §12.
Note: `results/dev_01_inventory.json` was **empty**, so the "development schema" used below is the
reference inventory produced by applying 0001–0021 to a clean database, not a live bobcat-dev dump (§13, R6).

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
4. Data is tiny: 49 tasks, 7 subsystems, 25 categories, 15 timeline columns, 5 milestone cells, 1 recurring
   event, ~2 orders, 1 subteam. With **0 auth users there is nothing to migrate for auth/profiles**, but that
   creates **BLOCKER B2**: `created_by` / `requested_by` / `changed_by` / `updated_by` are NOT NULL foreign
   keys to `profiles`, so a real, approved CTO profile must exist **before** any data import.
5. Three data facts must still be pinned down (script `03_…`): does the relational `tasks` table (~30 rows)
   overlap `workspace_state.tasks` (49)? what are the `orders` statuses? what do timeline `highlight` values
   mean? (§9.4–9.6, B3). They gate the data import (Phase 6.8), **not** the schema install.
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
| `public.workspace_state` | 1 row. `id text PK`, jsonb columns `taxonomy`, `tasks`, `orders`, `timeline_columns`, `recurring_events`, `timeline_milestones`, `updated_at`. Row `id` is 29 chars. |
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

### 9.2 subsystem_categories ← `taxonomy[].categories[]` (25)
`subsystem_id` = parent id; `name` = `name`; `engineering_rule` = `rule`; `active` = true; new uuid.
Unique `(subsystem_id,name)`. No `legacy_id` column ⇒ record `(category, '<subsystemId>::<name>') → new uuid` in `migration_log`.

### 9.3 tasks ← `workspace_state.tasks[]` (49) [+ relational `public.tasks` per Q1]
| new | from | rule |
|---|---|---|
| `id` | — | new uuid; **`legacy_id` = legacy id** (text, 3–14 chars, UNIQUE) |
| `title` / `description` | `title` / `notes` | blank notes → NULL |
| `subsystem_id` | `subsystemId` | must exist in 9.1 (else exception, skip row) |
| `category_id` | `category` (name) | lookup `(subsystem_id, name)` in 9.2. **`tasks_before_write` raises if a category belongs to another subsystem** ⇒ mismatch → `category_id` NULL + exception (count from script 03, Q4) |
| `status` | `status` | identical enum values: To Do / In Progress / Complete (0 unmapped) |
| `priority` | `priority` | identical: Critical/High/Medium/Low (0 unmapped) |
| `deadline` (timestamptz) | `deadline` (string) | only **7 of 49** are ISO `YYYY-MM-DD`; the other 42 are blank (expected) or another format — script 03 (`blank_deadline_count`, `non_iso_deadline_values`) says which. Blank → NULL; ISO date → **midnight UTC**, the exact convention the app itself writes (`new Date(d).toISOString()`) and reads (`slice(0,10)`); any other format → exception, deadline NULL (never guessed) |
| `created_by` | — | **importer profile id** (legacy has no creator) |
| `created_at` | relational `created_at` if matched, else import time | jsonb tasks carry no timestamp |
| `completed_at` | — | for `Complete` (1 task): import time (real completion time unknown) |
| `legacy_assignee_raw` | `assignee` | raw text (0–13 chars), blank → NULL; also an exception per distinct name |
| `primary_owner_id`, `task_assignees` | — | none (no profiles). Assign in the app after sign-up / from resolved exceptions (a 6.8 relink step). |

### 9.4 relational `public.tasks` (~30) — **source-of-truth question (Q1)**
Not assumed. Script 03 reports `ids_in_both`, `only_in_relational_ids`, `only_in_jsonb_count` and whether
overlapping rows differ in status/title/assignee/subsystem/deadline. Rules once known: match on legacy id;
if relational rows are a subset/duplicate ⇒ jsonb wins and relational is skipped (logged `skipped`); relational-only
rows are imported with the same mapping (status/priority are free text there — anything outside the enum ⇒ exception).

### 9.5 purchase_requests + purchase_request_items ← `public.orders` (~2) (`workspace_state.orders` is empty)
| new | from | rule |
|---|---|---|
| `purchase_requests.legacy_id` / `purchase_request_items.legacy_id` | `orders.id` | preserved |
| `title` | `item` | |
| `subsystem_id` | `subsystem_id` | must exist (9.1) else exception |
| `vendor` | `vendor` | |
| `description` | `urgency`, `requested_by` | `Urgency: … / Legacy requester: …` (no `legacy_requested_by` column exists; also an exception row) |
| `requested_by` | — | **importer id** |
| `status` + **`legacy_status_raw`** | `status` | raw text **always** stored in `legacy_status_raw`; enum mapped below |
| item: `description`/`quantity`/`unit_cost`/`link`/`notes` | `item`/`qty`/`unit_price`/`vendor_url`/`part_number` | `unit_price = 0` ⇒ NULL ("unknown"; confirm); `notes = 'Part #: …'` |
| `created_at` | `submitted_at` | |
| history | — | one `purchase_status_history` row per order: `from NULL → mapped`, `changed_by` importer, `changed_at = submitted_at`, note `Imported; legacy status: <raw>` (the trigger that normally writes it is disabled) |
| `reviewed_by/at` | — | NULL (legacy reviewer unknown) |

**Legacy status mapping** (proposal; legacy default is `Requested`; confirm against script 03 `orders.status_values`):

| legacy | → `purchase_status` |
|---|---|
| Requested | Submitted |
| Approved | Approved |
| Ordered | Ordered |
| Shipped / In Transit | In Transit |
| Received / Arrived / Delivered | Arrived in Shop |
| Complete / Completed | Completed |
| Rejected / Denied | Rejected |
| Cancelled | Cancelled |
| **anything else** | **Draft** + `migration_exceptions` (`purchase_status`) — never guessed |

### 9.6 timeline_columns ← `timeline_columns[]` (15)
`key` = `key` (**preserved**, e.g. `W4`; it is the FK target of the milestone cells — case must match exactly);
`label` = `label`; `sort_order` = array position (1..15; text keys don't sort); `active` true;
`highlight` (legacy **string**, 4–7 chars) → boolean: **needs Q5** (`highlight_values` in script 03) before a rule is fixed.

### 9.7 timeline_milestones ← `timeline_milestones{subsystemId:{colKey:text}}` (5 cells)
One row per (subsystem, column): `(subsystem_id, timeline_column_key)` preserved, `milestone_text` = text,
`updated_by` = importer. Cells whose subsystem or column doesn't exist ⇒ exception (script 03 reports orphans).
`fabrication` has an empty object ⇒ no rows.

### 9.8 recurring_events ← `recurring_events[]` (1)
`title`; `day_of_week` = `dayOfWeek` (must be 0–6, 0 = Sunday — verify the legacy convention); `time_label` = `time`
(e.g. `18:00`); `color` = `color`; `subsystem_id` NULL; new uuid (legacy id → `migration_log`).

### 9.9 No legacy source (created empty)
`calendar_events`, `milestones`, `competition_settings` (entered by CTO/Admin in the UI), `member_applications`,
`task_requests`, comments, attachments, CAD, notifications, `audit_logs`. `public.subteams` (~1 row) has no target
table: recorded in `migration_log` as `skipped`; its lead/members join the exception list.

### 9.10 ID preservation summary
Preserved verbatim: `subsystems.id`, `timeline_columns.key`, milestone composite keys. Preserved in `legacy_id`
(+ `migration_log`): tasks, purchase requests/items. New uuid + `migration_log` mapping only: categories, recurring events.

### 9.11 Relationships created after import
`tasks.category_id → subsystem_categories`; `task_assignees` + `primary_owner_id` (via sync trigger) once profiles
exist; `subsystem_members` (leads/members) after sign-up; `purchase_status_history → purchase_requests`;
`timeline_milestones → timeline_columns / subsystems`. All FKs are created by the migrations; the import only
has to insert parents before children.

---
## 10. Pre-flight checklist (before ANY change)

1. `04_preflight_checks_readonly.sql` on the target ⇒ `all_clear: true` (fails on `tasks`/`tasks_pkey` for an
   un-renamed production project — expected).
2. Decision on Path A/B recorded. **[B only]** explicit approval for the rename; confirm nothing live reads `public.tasks`.
3. Re-run `01_…` and compare with `results/prod_01_inventory.json` (schema drift check) and re-run `03_…`
   comparing `fingerprints` (legacy tables are anon-writable ⇒ data can change).
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
After import (6.8): row counts = 7 / 25 / 49(+/-Q1) / 15 / 5 / 1 / orders; every `legacy_id` unique; `migration_log` covers every legacy row; unresolved exceptions listed; no orphan FKs; notification count unchanged (import silent); all triggers re-enabled.

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
- **B3** Q1/Q2/Q5 open (script 03): tasks source of truth, order statuses, `highlight` semantics; also Q4 category/subsystem consistency (a mismatch throws in `tasks_before_write`).

**Risks**
- **R1 (security, pre-existing)** Every legacy table is world-readable **and writable** with the public key, and `taxonomy[].leadPin` (7 plaintext 4-digit PINs) sits in that public table. Not changed here (rule: don't modify legacy). Recommend: treat PINs as compromised/retired, never migrate them, and restrict/close the legacy policies at cutover (a Phase 6.8+ decision).
- **R2** Source drift: legacy is anon-writable ⇒ fingerprints (script 03) re-checked at import time.
- **R3** SQL Editor atomicity is assumed, not proven on Supabase ⇒ always wrap files in explicit `begin/commit` (proven in rehearsal).
- **R4** Rehearsals used PGlite + a Supabase stub (validates SQL order/syntax/inventory/rollback, not Supabase-managed behaviour). `postgres` must own the tables to `DISABLE TRIGGER` — production tables are owned by `postgres`; verify for the new tables (created by the same role).
- **R5** Auth is dashboard config (email confirmation, redirects) and can block the first CTO login.
- **R6** `dev_01_inventory.json` was empty: equality of live bobcat-dev with the migrations-derived reference is unverified. Cheap fix: run `01_…` on bobcat-dev and compare.
- **R7** `audit_logs` stays empty: **no writer exists** (no insert grant, no trigger). Not implemented (per instruction). Where to add later: (a) `admin_set_user_role/approved/active` (0020) — the natural first writers; (b) purchase/CAD approval transitions; (c) task status/owner changes; a `SECURITY DEFINER` insert helper or triggers would be needed, plus a new migration.
- **R8** Attribution loss: legacy creators/timestamps don't exist ⇒ all imported rows are attributed to the importer with raw legacy text preserved.
- **R9** Bucket removal and 0017's bucket upsert are outside SQL rollback / need pre-flight #5.
- **R10** Legacy people-to-account matching is manual (exceptions) — an admin task, not automatable safely.
- **R11** 14 trigger functions with default PUBLIC EXECUTE — accepted, not callable directly.

## 14. Phase 6.8 entry criteria (not started)
Path decided (B1) → target ready + Auth configured → 0001–0021 applied and verified (§11) → first CTO active (B2) →
script 03 results in hand (B3) → fresh drift check (R2) → then write and rehearse the import SQL.

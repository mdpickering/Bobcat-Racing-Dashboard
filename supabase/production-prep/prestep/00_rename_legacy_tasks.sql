-- =========================================================
-- 00_rename_legacy_tasks.sql        *** OPTIONAL — REQUIRES EXPLICIT APPROVAL ***
-- Phase 6.7 pre-step for "Path B" (installing v2 into the EXISTING production project).
-- NOT part of migrations 0001-0021 and NOT applied automatically.
--
-- WHY: production already has a legacy table public.tasks (text id, free-text assignee).
-- Migration 0004 runs `create table public.tasks`, which would fail with
-- "relation \"tasks\" already exists" (proven on a scratch replica of the production schema).
-- The only in-place way around it is to rename the legacy table out of the way.
--
-- THIS VIOLATES the standing rule "do not drop or rename existing production tables", so it
-- must not run without an explicit yes. It also breaks any legacy code that still reads
-- public.tasks. If that is unacceptable, use Path A (a separate v2 production project) — see
-- PRODUCTION_PLAN.md, where this is the #1 blocker.
--
-- Rows are untouched (rename only). Both the table and its primary-key constraint/index must be
-- renamed: a renamed table keeps its index name, and 0004 would then collide on `tasks_pkey`.
-- The legacy "Allow all on tasks" policy and its realtime publication membership follow the table.
-- Rollback: rollback/00_undo_rename_legacy_tasks.sql
-- =========================================================
begin;

alter table public.tasks rename to legacy_tasks;
alter table public.legacy_tasks rename constraint tasks_pkey to legacy_tasks_pkey;

commit;

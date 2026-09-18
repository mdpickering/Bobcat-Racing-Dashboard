-- =========================================================
-- 00_undo_rename_legacy_tasks.sql   (undo of prestep/00_rename_legacy_tasks.sql)
-- Only valid once the v2 `public.tasks` table has been removed (run 99_rollback_v2_schema.sql first),
-- otherwise the rename back fails because the name `tasks` is taken. Not a migration.
-- =========================================================
begin;

alter table public.legacy_tasks rename constraint legacy_tasks_pkey to tasks_pkey;
alter table public.legacy_tasks rename to tasks;

commit;

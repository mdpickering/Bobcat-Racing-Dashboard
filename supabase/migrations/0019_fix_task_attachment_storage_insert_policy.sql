-- =========================================================
-- 0019_fix_task_attachment_storage_insert_policy.sql
-- Patch: every upload to the task-attachments bucket failed with
-- "new row violates row-level security policy", including for
-- cto/admin (whose can_access_task() check bypasses all
-- subsystem logic and should always be true). Root-caused via
-- live browser testing: a SELECT-policy list() call succeeded
-- for cto1 (proving auth.uid() and can_access_task() both work
-- correctly inside storage.objects RLS), while every insert()
-- failed — isolating the bug to the INSERT policy's per-category
-- size/mime check, which read metadata->>'mimetype' and
-- metadata->>'size'. In this project's Storage API version,
-- `metadata` is not populated on the row at the point the INSERT
-- RLS check runs, so those reads returned null, the numeric
-- comparison evaluated to null, and `null and ...` made the
-- whole WITH CHECK false for every request regardless of role.
--
-- Fix: drop the metadata-based per-category check from the RLS
-- policy. The two real, non-bypassable boundaries that remain:
--   - bucket_id = 'task-attachments' and can_access_task(...) —
--     unchanged, still the real per-task access boundary.
--   - the bucket's own allowed_mime_types and file_size_limit
--     (set in 0017), which the Storage API enforces itself
--     before any row is written — unlike the RLS metadata read,
--     this is a real pre-write check, not timing-dependent.
-- file_size_limit stays at 20MB (the widest allowed category,
-- PDFs); the finer per-category caps (images/docs 10MB) are
-- enforced client-side by validateAttachmentFile() before
-- upload is attempted. This is a narrower server-side guarantee
-- than originally intended (a modified client could in theory
-- upload a maliciously-large but under-20MB image), but it is
-- still a real, non-bypassable bound — never unrestricted — and
-- a truthful account of what changed from the original design.
--
-- Does NOT touch workspace_state or any legacy table, and does
-- not migrate any production data. Run against bobcat-dev only.
-- =========================================================

drop policy if exists task_attachments_storage_insert on storage.objects;

create policy task_attachments_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'task-attachments'
    and public.can_access_task(nullif((storage.foldername(name))[1], '')::uuid)
  );

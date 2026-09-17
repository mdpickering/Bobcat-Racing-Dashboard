-- =========================================================
-- 0017_task_attachment_storage.sql
-- Phase 6.3 Chunk 3: Supabase Storage bucket + RLS for real
-- task attachment uploads, replacing the metadata-only stub
-- from Chunk 1. Builds on 0004 (task_attachments,
-- can_access_task) and reuses that function so storage access
-- can never drift out of sync with task visibility rules.
--
-- Storage objects are keyed "<task_id>/<timestamp>-<filename>"
-- so (storage.foldername(name))[1] recovers the task_id for the
-- can_access_task() check — the same convention
-- addTaskAttachmentMetadata's storage_path already used in
-- Chunk 1's stub.
--
-- Size/type limits are enforced twice: the bucket's own
-- file_size_limit/allowed_mime_types as a coarse gate, and a
-- per-category check in the INSERT policy for the actual agreed
-- limits (images/docs 10MB, PDFs 20MB) since a single bucket-
-- level limit can't express different caps per type. No video,
-- no archives — large CAD files are expected to use the
-- external_cad_link/drawing_link fields already on
-- cad_review_versions instead of file upload.
--
-- No update/delete policy: matches task_attachments having no
-- update/delete grant at the table level — an attachment is
-- permanent once added, same reasoning as cad_review_versions.
--
-- Does NOT touch workspace_state or any legacy table, and does
-- not migrate any production data. Run against bobcat-dev only.
-- =========================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'task-attachments',
  'task-attachments',
  false,
  20971520,
  array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy task_attachments_storage_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'task-attachments'
    and public.can_access_task(nullif((storage.foldername(name))[1], '')::uuid)
  );

create policy task_attachments_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'task-attachments'
    and public.can_access_task(nullif((storage.foldername(name))[1], '')::uuid)
    and (
      (
        metadata->>'mimetype' in ('image/jpeg', 'image/png', 'image/gif', 'image/webp')
        and (metadata->>'size')::bigint <= 10485760
      )
      or (
        metadata->>'mimetype' = 'application/pdf'
        and (metadata->>'size')::bigint <= 20971520
      )
      or (
        metadata->>'mimetype' in (
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'text/plain'
        )
        and (metadata->>'size')::bigint <= 10485760
      )
    )
  );

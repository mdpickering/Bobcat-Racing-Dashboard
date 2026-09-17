// Client-side validation matching the agreed per-category limits. The real,
// non-bypassable server-side boundaries are the task-attachments bucket's
// own allowed_mime_types (blocks any type outside the allowlist) and
// file_size_limit (20 MB, the widest allowed category — set in
// 0017_task_attachment_storage.sql). The finer per-category caps below
// (10 MB for images/docs) can't be re-checked in the storage RLS policy
// itself — see 0019_fix_task_attachment_storage_insert_policy.sql for why
// — so this client check is what actually enforces the tighter limits;
// a file between 10-20 MB of an image/doc type is still blocked by type
// allowlisting only if it isn't also within 20 MB.
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const DOCUMENT_TYPES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]
const PDF_TYPE = 'application/pdf'

export const TASK_ATTACHMENT_BUCKET = 'task-attachments'
export const ACCEPTED_ATTACHMENT_TYPES = [...IMAGE_TYPES, PDF_TYPE, ...DOCUMENT_TYPES]

const TEN_MB = 10 * 1024 * 1024
const TWENTY_MB = 20 * 1024 * 1024

export function validateAttachmentFile(file: File): string | null {
  if (IMAGE_TYPES.includes(file.type)) {
    return file.size <= TEN_MB ? null : 'Images must be 10 MB or smaller.'
  }
  if (file.type === PDF_TYPE) {
    return file.size <= TWENTY_MB ? null : 'PDFs must be 20 MB or smaller.'
  }
  if (DOCUMENT_TYPES.includes(file.type)) {
    return file.size <= TEN_MB ? null : 'Documents must be 10 MB or smaller.'
  }
  if (file.type.startsWith('video/')) {
    return 'Video files are not supported. Use an external link instead.'
  }
  if (file.type.includes('zip') || file.name.toLowerCase().endsWith('.zip')) {
    return 'Archive files are not supported. Upload individual files, or use an external link for large CAD packages.'
  }
  return 'Unsupported file type. Allowed: images, PDFs, and common office documents.'
}

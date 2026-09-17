'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Paperclip, Upload, FileText, ExternalLink } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import EmptyState from '@/components/ui/EmptyState'
import { createClient } from '@/lib/supabase/client'
import { addTaskAttachmentMetadata, getTaskAttachmentUrl } from '@/lib/supabase/queries/tasks'
import { validateAttachmentFile, TASK_ATTACHMENT_BUCKET, ACCEPTED_ATTACHMENT_TYPES } from '@/lib/attachments'
import { timeAgo } from '@/lib/format'
import type { TaskAttachment } from '@/types/database'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function TaskAttachmentsPanel({ taskId, attachments }: { taskId: string; attachments: TaskAttachment[] }) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)

    const validationError = validateAttachmentFile(file)
    if (validationError) {
      setError(validationError)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setUploading(true)
    try {
      const storagePath = `${taskId}/${Date.now()}-${file.name}`
      const supabase = createClient()
      const { error: uploadError } = await supabase.storage.from(TASK_ATTACHMENT_BUCKET).upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      })
      if (uploadError) throw uploadError

      await addTaskAttachmentMetadata(supabase, {
        task_id: taskId,
        file_name: file.name,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.type || null,
      })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload this file.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleOpen(a: TaskAttachment) {
    setOpeningId(a.id)
    setError(null)
    try {
      const supabase = createClient()
      const url = await getTaskAttachmentUrl(supabase, a.storage_path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open this file.')
    } finally {
      setOpeningId(null)
    }
  }

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wide text-text-primary">Attachments</h3>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 text-[10px] font-mono uppercase text-accent-blue hover:underline disabled:opacity-50"
        >
          <Upload size={11} /> {uploading ? 'Uploading…' : 'Add file'}
        </button>
        <input ref={fileInputRef} type="file" accept={ACCEPTED_ATTACHMENT_TYPES.join(',')} className="hidden" onChange={handleFileSelected} />
      </div>

      <p className="mb-2 text-[10px] text-text-muted">Images and documents up to 10 MB, PDFs up to 20 MB. For large CAD files, use an external link instead.</p>

      {error && <p className="mb-2 text-[11px] text-rose-400">{error}</p>}

      {attachments.length === 0 ? (
        <EmptyState icon={Paperclip} title="No attachments yet" />
      ) : (
        <ul className="space-y-1.5">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-2 text-xs">
              <FileText size={14} className="flex-shrink-0 text-text-muted" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-text-primary">{a.file_name}</div>
                <div className="text-[10px] text-text-muted">
                  {formatBytes(a.file_size)} · {a.uploader?.display_name || a.uploader?.email} · {timeAgo(a.created_at)}
                </div>
              </div>
              <button
                type="button"
                disabled={openingId === a.id}
                onClick={() => handleOpen(a)}
                className="flex-shrink-0 text-text-muted hover:text-accent-blue disabled:opacity-50"
                title="Open"
              >
                <ExternalLink size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

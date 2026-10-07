'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Pencil, Trash2, ArrowUpRight } from 'lucide-react'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { createTaskFromMeetingAction, deleteActionItem, updateActionItem } from '@/lib/supabase/queries/meetings'
import { getErrorMessage } from '@/lib/errors'
import { formatDeadline } from '@/lib/deadline'
import type { TechnicalMeetingActionItem } from '@/types/database'

interface ActionItemRowProps {
  item: TechnicalMeetingActionItem
  canEditNow: boolean
  // Deleting an action item is manager-only (migration 0041's delete policy) — a recorder can edit,
  // complete/cancel, and create a task from one, but not remove it outright.
  canManage: boolean
  onEdit: () => void
}

export default function ActionItemRow({ item, canEditNow, canManage, onEdit }: ActionItemRowProps) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleStatusChange(status: string) {
    setBusy(true)
    try {
      await updateActionItem(createClient(), item.id, { status })
      router.refresh()
    } catch (err) {
      toast.push(getErrorMessage(err, 'Could not update this action item.'), 'danger')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateTask() {
    setBusy(true)
    try {
      await createTaskFromMeetingAction(createClient(), item.id)
      toast.push('Task created.', 'success')
      router.refresh()
    } catch (err) {
      toast.push(getErrorMessage(err, 'Could not create a task from this action item.'), 'danger')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    setDeleteError(null)
    try {
      await deleteActionItem(createClient(), item.id)
      setConfirmOpen(false)
      router.refresh()
    } catch (err) {
      setDeleteError(getErrorMessage(err, 'Could not remove this action item.'))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-text-primary">{item.title}</p>
        <p className="mt-0.5 text-2xs text-text-muted">
          {item.assignee?.display_name || item.assignee?.email || 'Unassigned'}
          {item.due_date ? ` · due ${formatDeadline(item.due_date)}` : ''}
          {item.subsystem ? ` · ${item.subsystem.name}` : ''}
        </p>
        {item.linked_task && (
          <Link href={`/tasks/${item.linked_task.id}`} className="mt-0.5 inline-flex items-center gap-1 text-2xs text-accent-blue hover:underline">
            Linked task: {item.linked_task.title} <ArrowUpRight size={10} />
          </Link>
        )}
      </div>
      {canEditNow ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Select value={item.status} onChange={(e) => handleStatusChange(e.target.value)} disabled={busy} className="w-auto py-1">
            <option value="open">Open</option>
            <option value="complete">Complete</option>
            <option value="cancelled">Cancelled</option>
          </Select>
          {!item.linked_task_id && (
            <Button size="sm" variant="secondary" disabled={busy || !item.subsystem_id} title={!item.subsystem_id ? 'Needs a subsystem first' : undefined} onClick={handleCreateTask}>
              Create task
            </Button>
          )}
          <Button aria-label={`Edit action item ${item.title}`} size="sm" variant="ghost" disabled={busy} onClick={onEdit}>
            <Pencil size={12} />
          </Button>
          {canManage && (
            <Button aria-label={`Delete action item ${item.title}`} size="sm" variant="ghost" disabled={busy} onClick={() => { setDeleteError(null); setConfirmOpen(true) }}>
              <Trash2 size={12} />
            </Button>
          )}
        </div>
      ) : (
        <span className="flex-shrink-0 text-2xs font-semibold uppercase tracking-wide text-text-muted">{item.status}</span>
      )}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Remove action item?"
        confirmLabel="Remove"
        busyLabel="Removing…"
        busy={busy}
        error={deleteError}
        description={<p>&ldquo;{item.title}&rdquo; will be removed from this meeting.</p>}
      />
    </div>
  )
}

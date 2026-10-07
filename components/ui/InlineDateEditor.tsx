'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { updateTask } from '@/lib/supabase/queries/tasks'
import { rescheduleTask } from '@/lib/supabase/queries/operations'
import { deadlineDateKey, formatDeadline, isDeadlineOverdue, isDeadlineDueSoon } from '@/lib/deadline'
import { getErrorMessage } from '@/lib/errors'
import { pastDateNote } from '@/lib/taskGuards'
import { useToast } from './Toast'

interface InlineDateEditorProps {
  taskId: string
  deadline: string | null
  status?: string
  // The viewer is the COO, CTO or an admin: save through reschedule_task() (deadline-only, COO/CTO/Admin-only,
  // the same secure path Operations uses) instead of the full task update, which the COO has no right to.
  viaReschedule?: boolean
}

// Click the date to edit it in place: no page navigation, no separate edit screen, matching the
// "click date -> pick date -> save -> row updates" rule. Saves through the full task-update path
// (updateTask -> tasks RLS: cto/admin or the task's own subsystem lead) by default, or through the
// narrower reschedule_task() RPC when viaReschedule is set (the COO has no tasks UPDATE policy at all,
// only that function). Only render this where the caller has already confirmed the viewer may edit
// the date. The database still has final say either way.
export default function InlineDateEditor({ taskId, deadline, status, viaReschedule = false }: InlineDateEditorProps) {
  const router = useRouter()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(deadlineDateKey(deadline) ?? '')
  const [busy, setBusy] = useState(false)

  async function save(next: string) {
    if (next === (deadlineDateKey(deadline) ?? '')) {
      setEditing(false)
      return
    }
    setBusy(true)
    try {
      const supabase = createClient()
      if (viaReschedule) await rescheduleTask(supabase, taskId, next || null)
      else await updateTask(supabase, taskId, { deadline: next ? `${next}T00:00:00.000Z` : null })
      setEditing(false)
      const note = pastDateNote(next || null, status ?? '')
      if (note) toast.push(note, 'warning')
      router.refresh()
    } catch (err) {
      toast.push(getErrorMessage(err, 'Could not update this deadline.'), 'danger')
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        aria-label="Edit deadline"
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onBlur={(e) => save(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save(value)
          if (e.key === 'Escape') setEditing(false)
        }}
        className="rounded-lg border border-accent-blue bg-surface px-2 py-1 text-xs tabular-nums text-text-primary outline-none"
      />
    )
  }

  const overdue = isDeadlineOverdue(deadline, status)
  const soon = !overdue && isDeadlineDueSoon(deadline, status, 3)
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`group -mx-1.5 -my-1 flex items-center gap-1 rounded-lg px-1.5 py-1 text-left hover:bg-surface-raised ${
        overdue ? 'font-medium text-status-danger' : soon ? 'font-medium text-status-warning' : 'text-text-secondary'
      }`}
    >
      {deadline ? formatDeadline(deadline) : <span className="text-text-muted">No deadline</span>}
      <Pencil size={10} className="flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
    </button>
  )
}

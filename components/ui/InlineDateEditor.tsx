'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { updateTask } from '@/lib/supabase/queries/tasks'
import { deadlineDateKey, formatDeadline, isDeadlineOverdue, isDeadlineDueSoon } from '@/lib/deadline'
import { getErrorMessage } from '@/lib/errors'
import { useToast } from './Toast'

interface InlineDateEditorProps {
  taskId: string
  deadline: string | null
  status?: string
}

// Click the date to edit it in place: no page navigation, no separate edit screen, matching the
// "click date -> pick date -> save -> row updates" rule. Goes through the full task-update path
// (updateTask -> tasks RLS: cto/admin or the task's own subsystem lead), unlike Operations'
// RescheduleControl (which deliberately uses the narrower, COO/CTO/Admin-only reschedule_task()
// RPC) -- so only render this where the caller has already confirmed the viewer may manage that
// specific task. The database still has final say either way.
export default function InlineDateEditor({ taskId, deadline, status }: InlineDateEditorProps) {
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
      await updateTask(supabase, taskId, { deadline: next ? `${next}T00:00:00.000Z` : null })
      setEditing(false)
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

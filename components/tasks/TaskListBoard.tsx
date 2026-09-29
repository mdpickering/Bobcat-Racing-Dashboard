'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import BulkActionBar from '@/components/ui/BulkActionBar'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { updateTask } from '@/lib/supabase/queries/tasks'
import { getErrorMessage } from '@/lib/errors'
import TaskList from './TaskList'
import type { Task } from '@/types/database'

interface TaskListBoardProps {
  tasks: Task[]
  currentUserId: string
  // cto/admin, or the lead of a task's own subsystem -- tasks RLS is the real gate; this decides
  // which rows get a checkbox and inline editing at all. Plain serializable values (a Server
  // Component caller cannot pass a closure to this client component).
  isAdmin?: boolean
  ledSubsystemIds?: string[]
  canAccept?: boolean
  emptyTitle?: string
  emptyDescription?: string
}

// Adds bulk-selection on top of the plain TaskList for a lead/admin managing many of a subsystem's
// tasks at once ("change the deadline on 10 tasks" without opening 10 task pages) -- the same
// pattern as Operations > Deadlines' DeadlinesBoard, using the full task-update path (updateTask)
// since this isn't COO/CTO/Admin-only like Operations' reschedule_task().
export default function TaskListBoard({ tasks, currentUserId, isAdmin, ledSubsystemIds, canAccept, emptyTitle, emptyDescription }: TaskListBoardProps) {
  const router = useRouter()
  const toast = useToast()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDate, setBulkDate] = useState('')
  const [applying, setApplying] = useState(false)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll(ids: string[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (checked) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  async function applyBulkDeadline() {
    if (!bulkDate || selected.size === 0) return
    setApplying(true)
    try {
      const supabase = createClient()
      const ids = [...selected]
      const results = await Promise.allSettled(ids.map((id) => updateTask(supabase, id, { deadline: `${bulkDate}T00:00:00.000Z` })))
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed > 0) toast.push(`${ids.length - failed} of ${ids.length} tasks updated — ${failed} failed.`, 'warning')
      else toast.push(`${ids.length} task${ids.length === 1 ? '' : 's'} rescheduled to that date.`, 'success')
      setSelected(new Set())
      setBulkDate('')
      router.refresh()
    } catch (err) {
      toast.push(getErrorMessage(err, 'Could not update these tasks.'), 'danger')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="space-y-3 pb-2">
      <TaskList
        tasks={tasks}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        ledSubsystemIds={ledSubsystemIds}
        canAccept={canAccept}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        selectedIds={selected}
        onToggle={toggle}
        onToggleAll={toggleAll}
      />
      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <label className="flex items-center gap-1.5 text-xs text-text-secondary">
          Change deadline to
          <Input type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} disabled={applying} className="w-auto py-1" />
        </label>
        <Button size="sm" disabled={applying || !bulkDate} onClick={applyBulkDeadline}>
          {applying ? 'Applying…' : 'Apply'}
        </Button>
      </BulkActionBar>
    </div>
  )
}

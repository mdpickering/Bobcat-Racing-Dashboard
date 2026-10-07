'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import BulkActionBar from '@/components/ui/BulkActionBar'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { updateTask, setTaskAssignee } from '@/lib/supabase/queries/tasks'
import { rescheduleTask } from '@/lib/supabase/queries/operations'
import { getErrorMessage } from '@/lib/errors'
import { pastDateNote } from '@/lib/taskGuards'
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
  // COO/CTO/admin: may change any task's due date, saved through reschedule_task() (see TaskList).
  canReschedule?: boolean
  // Members of this list's subsystem that a task can be assigned to, and whether the viewer may assign at all (admin,
  // CTO or this subsystem's lead -- the database enforces the same rule). Plain serializable values.
  owners?: { id: string; name: string }[]
  canAssign?: boolean
  canAccept?: boolean
  emptyTitle?: string
  emptyDescription?: string
}

// Adds bulk-selection on top of the plain TaskList for a lead/admin managing many of a subsystem's
// tasks at once ("change the deadline on 10 tasks" without opening 10 task pages) -- the same
// pattern as Operations > Deadlines' DeadlinesBoard. A COO/CTO/admin saves through reschedule_task() (the only
// write the COO is allowed); a subsystem lead, who may not use that RPC, saves through the full task update.
export default function TaskListBoard({ tasks, currentUserId, isAdmin, ledSubsystemIds, canReschedule = false, owners = [], canAssign = false, canAccept, emptyTitle, emptyDescription }: TaskListBoardProps) {
  const router = useRouter()
  const toast = useToast()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDate, setBulkDate] = useState('')
  const [applying, setApplying] = useState(false)
  const [bulkOwner, setBulkOwner] = useState('')
  const [assigning, setAssigning] = useState(false)

  // Bulk assign only fills in owners that are missing: a task that already has a primary owner is left alone, so a bulk
  // action can never silently take a task away from someone.
  const selectedUnowned = tasks.filter((t) => selected.has(t.id) && !t.primary_owner_id)
  const alreadyOwned = selected.size - selectedUnowned.length

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
      const results = await Promise.allSettled(ids.map((id) => (canReschedule ? rescheduleTask(supabase, id, bulkDate) : updateTask(supabase, id, { deadline: `${bulkDate}T00:00:00.000Z` }))))
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed > 0) toast.push(`${ids.length - failed} of ${ids.length} tasks updated — ${failed} failed.`, 'warning')
      else toast.push(`${ids.length} task${ids.length === 1 ? '' : 's'} rescheduled to that date.`, 'success')
      const pastNote = failed < ids.length ? pastDateNote(bulkDate, 'To Do') : null
      if (pastNote) toast.push(pastNote, 'warning')
      setSelected(new Set())
      setBulkDate('')
      router.refresh()
    } catch (err) {
      toast.push(getErrorMessage(err, 'Could not update these tasks.'), 'danger')
    } finally {
      setApplying(false)
    }
  }

  async function applyBulkAssign() {
    if (!bulkOwner || selectedUnowned.length === 0) return
    setAssigning(true)
    try {
      const supabase = createClient()
      const results = await Promise.allSettled(selectedUnowned.map((t) => setTaskAssignee(supabase, t.id, bulkOwner, 'primary')))
      const failed = results.filter((r) => r.status === 'rejected').length
      const done = selectedUnowned.length - failed
      const who = owners.find((o) => o.id === bulkOwner)?.name ?? 'that member'
      if (failed > 0) toast.push(`Assigned ${done} of ${selectedUnowned.length} tasks to ${who} -- ${failed} failed.`, 'warning')
      else toast.push(`Assigned ${done} task${done === 1 ? '' : 's'} to ${who}.`, 'success')
      if (alreadyOwned > 0) toast.push(`${alreadyOwned} selected task${alreadyOwned === 1 ? ' already has' : 's already have'} an owner and ${alreadyOwned === 1 ? 'was' : 'were'} left as is.`, 'info')
      setSelected(new Set())
      setBulkOwner('')
      router.refresh()
    } catch (err) {
      toast.push(getErrorMessage(err, 'Could not assign these tasks.'), 'danger')
    } finally {
      setAssigning(false)
    }
  }

  return (
    <div className="space-y-3 pb-2">
      <TaskList
        tasks={tasks}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        ledSubsystemIds={ledSubsystemIds}
        canReschedule={canReschedule}
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
        {canAssign && owners.length > 0 && (
          <>
            <span className="hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              Assign owner
              <Select value={bulkOwner} onChange={(e) => setBulkOwner(e.target.value)} disabled={assigning} className="w-auto py-1">
                <option value="">Choose a member…</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </label>
            <Button size="sm" disabled={assigning || !bulkOwner || selectedUnowned.length === 0} onClick={applyBulkAssign}>
              {assigning ? 'Assigning…' : `Assign ${selectedUnowned.length} unowned`}
            </Button>
            {alreadyOwned > 0 && <span className="text-2xs text-text-muted">{alreadyOwned} already owned, skipped</span>}
          </>
        )}
      </BulkActionBar>
    </div>
  )
}

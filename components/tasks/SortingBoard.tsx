'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRightLeft, CheckCircle2 } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import BulkActionBar from '@/components/ui/BulkActionBar'
import Button from '@/components/ui/Button'
import DataTable, { type Column } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import Select from '@/components/ui/Select'
import { PriorityBadge } from '@/components/tasks/TaskBadges'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { updateTask } from '@/lib/supabase/queries/tasks'
import { getErrorMessage } from '@/lib/errors'
import { formatDeadline } from '@/lib/deadline'
import { daysWaiting } from '@/lib/pickup'
import { isGeneralSubsystem, moveOptions, moveToPatch, parseMove, type SortingCategory, type SortingSubsystem } from '@/lib/sorting'
import type { Task } from '@/types/database'

interface SortingBoardProps {
  tasks: Task[]
  categories: SortingCategory[]
  subsystems: SortingSubsystem[]
  // cto/admin: may move a task to another subsystem (the database refuses anyone else)
  canMoveSubsystem: boolean
  // cto/admin, or the lead of a task's subsystem: may give it a category
  isAdmin: boolean
  ledSubsystemIds: string[]
  filtered: boolean
}

// One row's "Move to" control. Two kinds of target in one list: a category of the task's own subsystem, or (cto/admin) another
// subsystem. Nothing is saved until Move is pressed, because a subsystem move takes the task out of the old subsystem's view.
function MoveCell({ task, categories, subsystems, canMoveSubsystem, canEdit }: { task: Task; categories: SortingCategory[]; subsystems: SortingSubsystem[]; canMoveSubsystem: boolean; canEdit: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const options = moveOptions(task, categories, subsystems, canMoveSubsystem)
  const nothing = options.categories.length === 0 && options.subsystems.length === 0

  if (!canEdit) return <span className="text-text-muted">Only a lead can sort this</span>
  if (nothing) return <span className="text-text-muted">No categories yet. Add some on the subsystem page.</span>

  async function move() {
    const target = parseMove(value)
    if (!target) return
    setBusy(true)
    try {
      await updateTask(createClient(), task.id, moveToPatch(target))
      const label = [...options.categories, ...options.subsystems].find((o) => o.value === value)?.label ?? 'there'
      toast.push(target.kind === 'category' ? `Sorted into ${label}.` : `Moved to ${label}.`, 'success')
      router.refresh()
    } catch (err) {
      toast.push(getErrorMessage(err, 'Could not move this task.'), 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Select aria-label={`Move ${task.title}`} value={value} disabled={busy} onChange={(e) => setValue(e.target.value)} className="w-auto min-w-[10rem] py-1">
        <option value="">Choose where…</option>
        {options.categories.length > 0 && (
          <optgroup label={`Category in ${task.subsystem?.name ?? 'this subsystem'}`}>
            {options.categories.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        )}
        {options.subsystems.length > 0 && (
          <optgroup label="Move to subsystem">
            {options.subsystems.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        )}
      </Select>
      <Button size="sm" variant="secondary" disabled={busy || !value} onClick={move}>
        <ArrowRightLeft size={12} aria-hidden="true" /> {busy ? 'Moving…' : 'Move'}
      </Button>
    </div>
  )
}

export default function SortingBoard({ tasks, categories, subsystems, canMoveSubsystem, isAdmin, ledSubsystemIds, filtered }: SortingBoardProps) {
  const router = useRouter()
  const toast = useToast()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkTarget, setBulkTarget] = useState('')
  const [moving, setMoving] = useState(false)

  const canEdit = (t: Task) => isAdmin || ledSubsystemIds.includes(t.subsystem_id)
  const selectableIds = canMoveSubsystem ? tasks.map((t) => t.id) : []
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))
  const bulkOptions = subsystems.slice().sort((a, b) => Number(isGeneralSubsystem(b.id)) - Number(isGeneralSubsystem(a.id)) || a.name.localeCompare(b.name))
  const bulkLabel = bulkOptions.find((s) => s.id === bulkTarget)?.name ?? ''

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function applyBulkMove() {
    if (!bulkTarget || selected.size === 0) return
    setMoving(true)
    try {
      const supabase = createClient()
      const ids = [...selected].filter((id) => tasks.find((t) => t.id === id)?.subsystem_id !== bulkTarget)
      const results = await Promise.allSettled(ids.map((id) => updateTask(supabase, id, moveToPatch({ kind: 'subsystem', id: bulkTarget }))))
      const failed = results.filter((r) => r.status === 'rejected').length
      const done = ids.length - failed
      if (failed > 0) toast.push(`Moved ${done} of ${ids.length} tasks to ${bulkLabel} — ${failed} failed.`, 'warning')
      else toast.push(`Moved ${done} task${done === 1 ? '' : 's'} to ${bulkLabel}.`, 'success')
      setSelected(new Set())
      setBulkTarget('')
      router.refresh()
    } catch (err) {
      toast.push(getErrorMessage(err, 'Could not move these tasks.'), 'danger')
    } finally {
      setMoving(false)
    }
  }

  const columns: Column<Task>[] = [
    {
      key: 'task',
      header: 'Task',
      cell: (t) => (
        <>
          <Link href={`/tasks/${t.id}`} className="-my-3 block max-w-[22rem] truncate py-3 font-medium text-text-primary hover:text-accent-blue md:my-0 md:py-0">
            {t.title || 'Untitled task'}
          </Link>
          <div className="mt-0.5 text-xs text-text-muted">
            {t.subsystem?.name ?? 'Unknown'} · {t.primary_owner ? t.primary_owner.display_name || t.primary_owner.email : 'Unassigned'}
          </div>
          <div className="mt-1.5 md:hidden">
            <MoveCell task={t} categories={categories} subsystems={subsystems} canMoveSubsystem={canMoveSubsystem} canEdit={canEdit(t)} />
          </div>
        </>
      ),
    },
    { key: 'priority', header: 'Priority', hideBelow: 'lg', cell: (t) => <PriorityBadge priority={t.priority} /> },
    { key: 'due', header: 'Due', hideBelow: 'lg', cell: (t) => (t.deadline ? <span className="text-text-secondary">{formatDeadline(t.deadline)}</span> : <span className="text-text-muted">No deadline</span>) },
    {
      key: 'owner',
      header: 'Owner',
      hideBelow: 'xl',
      cell: (t) =>
        t.primary_owner ? (
          <span className="inline-flex items-center gap-2 text-text-secondary">
            <Avatar name={t.primary_owner.display_name || t.primary_owner.email} src={t.primary_owner.avatar_url} size={20} />
            <span className="max-w-[9rem] truncate">{t.primary_owner.display_name || t.primary_owner.email}</span>
          </span>
        ) : (
          <span className="text-text-muted">Unassigned</span>
        ),
    },
    { key: 'age', header: 'Age', hideBelow: 'xl', cell: (t) => <span className="text-text-muted">{daysWaiting(t.created_at)}d</span> },
    {
      key: 'move',
      header: 'Move to',
      hideBelow: 'md',
      cell: (t) => <MoveCell task={t} categories={categories} subsystems={subsystems} canMoveSubsystem={canMoveSubsystem} canEdit={canEdit(t)} />,
    },
  ]
  if (canMoveSubsystem) {
    columns.unshift({
      key: 'select',
      header: (
        <label className="-m-3.5 flex cursor-pointer items-center justify-center p-3.5">
          <input
            type="checkbox"
            aria-label="Select all tasks"
            checked={allSelected}
            onChange={(e) => setSelected(e.target.checked ? new Set(selectableIds) : new Set())}
            className="h-4 w-4 accent-accent-blue"
          />
        </label>
      ),
      cell: (t) => (
        <label className="-m-3.5 flex cursor-pointer items-center justify-center p-3.5">
          <input type="checkbox" aria-label={`Select ${t.title || 'task'}`} checked={selected.has(t.id)} onChange={() => toggle(t.id)} className="h-4 w-4 accent-accent-blue" />
        </label>
      ),
    })
  }

  return (
    <div className="space-y-3 pb-2">
      <DataTable
        countLabel="tasks"
        caption="Tasks that need sorting"
        columns={columns}
        rows={tasks}
        rowKey={(t) => t.id}
        emptyState={
          <EmptyState
            icon={CheckCircle2}
            title={filtered ? 'No tasks match these filters' : 'Everything is sorted'}
            description={filtered ? 'Try clearing your filters.' : 'Every open task has a category, or lives in General.'}
          />
        }
      />
      {canMoveSubsystem && (
        <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
          <label className="flex items-center gap-1.5 text-xs text-text-secondary">
            Move to
            <Select value={bulkTarget} onChange={(e) => setBulkTarget(e.target.value)} disabled={moving} className="w-auto py-1">
              <option value="">Choose a subsystem…</option>
              {bulkOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </label>
          <Button size="sm" disabled={moving || !bulkTarget} onClick={applyBulkMove}>
            {moving ? 'Moving…' : `Move ${selected.size}`}
          </Button>
        </BulkActionBar>
      )}
    </div>
  )
}

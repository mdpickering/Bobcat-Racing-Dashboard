'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ListChecks } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import DataTable, { type Column } from '@/components/ui/DataTable'
import Avatar from '@/components/ui/Avatar'
import Select from '@/components/ui/Select'
import InlineDateEditor from '@/components/ui/InlineDateEditor'
import { StatusBadge, PriorityBadge } from '@/components/tasks/TaskBadges'
import AcceptTaskButton from '@/components/tasks/AcceptTaskButton'
import TaskPreviewDrawer from '@/components/tasks/TaskPreviewDrawer'
import { createClient } from '@/lib/supabase/client'
import { updateTask } from '@/lib/supabase/queries/tasks'
import { getErrorMessage } from '@/lib/errors'
import { startNudge } from '@/lib/taskGuards'
import { useToast } from '@/components/ui/Toast'
import { formatDeadline, isDeadlineDueSoon, isDeadlineOverdue } from '@/lib/deadline'
import type { Task, TaskStatus } from '@/types/database'

const STATUSES: TaskStatus[] = ['To Do', 'In Progress', 'Blocked', 'Review', 'Complete']

interface TaskListProps {
  tasks: Task[]
  currentUserId?: string
  // cto/admin, or the lead of a task's own subsystem (tasks RLS is the real gate for deadline/
  // priority edits) -- plain serializable values, not a function: this is a client component, and a
  // Server Component caller cannot pass a closure across that boundary. Omit both to get the
  // previous fully read-only list.
  isAdmin?: boolean
  ledSubsystemIds?: string[]
  // The viewer is the COO, CTO or an admin (canManageOperations): they may change ANY task's due date, saved
  // through reschedule_task() -- deadline-only, which is all the COO is allowed. Plain boolean, for the same
  // server-to-client-boundary reason as above.
  canReschedule?: boolean
  // Whether the viewer may accept an unassigned task in this list for themselves (server-side
  // authorization in accept_task/migration 0024 is the real gate — this just decides whether to
  // show the button at all, e.g. the subsystem page passes true only for its own members).
  canAccept?: boolean
  emptyTitle?: string
  emptyDescription?: string
  // Optional bulk-selection column, same shape as DeadlineTable's.
  selectedIds?: Set<string>
  onToggle?: (id: string) => void
  onToggleAll?: (ids: string[], checked: boolean) => void
}

function DueCell({ task }: { task: Task }) {
  if (!task.deadline) return <span className="text-text-muted">No deadline</span>
  const overdue = isDeadlineOverdue(task.deadline, task.status)
  const soon = !overdue && isDeadlineDueSoon(task.deadline, task.status, 3)
  return (
    <span className={overdue ? 'font-medium text-status-danger' : soon ? 'font-medium text-status-warning' : 'text-text-secondary'}>
      {formatDeadline(task.deadline)}
      {overdue && <span className="ml-1.5 text-2xs uppercase tracking-wide">overdue</span>}
      {soon && <span className="ml-1.5 text-2xs uppercase tracking-wide">soon</span>}
    </span>
  )
}

function StatusCell({ task, editable }: { task: Task; editable: boolean }) {
  const router = useRouter()
  const toast = useToast()
  if (!editable) return <StatusBadge status={task.status} />
  return (
    <Select
      aria-label={`Status for ${task.title}`}
      value={task.status}
      className="w-auto min-w-[7.5rem] py-1"
      onChange={async (e) => {
        try {
          const nextStatus = e.target.value
          await updateTask(createClient(), task.id, { status: nextStatus })
          const nudge = startNudge(task, nextStatus)
          if (nudge) toast.push(nudge, 'warning')
          router.refresh()
        } catch (err) {
          toast.push(getErrorMessage(err, 'Could not update status.'), 'danger')
        }
      }}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </Select>
  )
}

export default function TaskList({
  tasks,
  currentUserId,
  isAdmin = false,
  ledSubsystemIds = [],
  canReschedule = false,
  canAccept = false,
  emptyTitle = 'No tasks match these filters',
  emptyDescription = 'Try adjusting or clearing your filters.',
  selectedIds,
  onToggle,
  onToggleAll,
}: TaskListProps) {
  const [previewId, setPreviewId] = useState<string | null>(null)
  const selectable = Boolean(selectedIds && onToggle && onToggleAll)
  const canManageTask = (task: Task) => isAdmin || ledSubsystemIds.includes(task.subsystem_id)
  const canEditDate = (task: Task) => canReschedule || canManageTask(task)
  const canEditStatus = (task: Task) => canManageTask(task) || Boolean(currentUserId && task.assignees?.some((a) => a.user_id === currentUserId))
  const previewTask = previewId ? (tasks.find((t) => t.id === previewId) ?? null) : null

  // A plain left-click opens the quick-view drawer instead of navigating away (closing it leaves
  // this list exactly as it was); ctrl/cmd/shift-click and middle-click still open the real link
  // normally (browser default, or opens a background tab), so the task remains a genuine <a href>
  // for keyboard, screen-reader, and "open in new tab" users.
  function handleTitleClick(e: React.MouseEvent, taskId: string) {
    if (!currentUserId || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    setPreviewId(taskId)
  }

  const columns: Column<Task>[] = [
    {
      key: 'task',
      header: 'Task',
      cell: (task) => (
        <>
          <Link href={`/tasks/${task.id}`} onClick={(e) => handleTitleClick(e, task.id)} className="-my-3 block max-w-[20rem] truncate py-3 font-medium text-text-primary hover:text-accent-blue md:my-0 md:py-0 2xl:max-w-[34rem]">
            {task.title || 'Untitled task'}
          </Link>
          {/* the separator is drawn by CSS after the first item, so a wrapped line never starts with a stray dot */}
          <div className="meta-dots mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-text-muted">
            <span className="min-w-0 max-w-full truncate">{task.subsystem?.name ?? 'Unknown'}</span>
            {task.category?.name && <span className="min-w-0 max-w-full truncate">{task.category.name}</span>}
          </div>
          {/* on phones the due date and badges fold into the first column, each on its own line */}
          <div className="mt-1 text-xs sm:hidden">{canEditDate(task) ? <InlineDateEditor taskId={task.id} deadline={task.deadline} status={task.status} viaReschedule={canReschedule} /> : <DueCell task={task} />}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:hidden">
            <PriorityBadge priority={task.priority} />
            <StatusCell task={task} editable={canEditStatus(task)} />
          </div>
        </>
      ),
    },
    { key: 'priority', header: 'Priority', hideBelow: 'sm', cell: (task) => <PriorityBadge priority={task.priority} /> },
    { key: 'status', header: 'Status', hideBelow: 'sm', cell: (task) => <StatusCell task={task} editable={canEditStatus(task)} /> },
    { key: 'due', header: 'Due', hideBelow: 'sm', cell: (task) => (canEditDate(task) ? <InlineDateEditor taskId={task.id} deadline={task.deadline} status={task.status} viaReschedule={canReschedule} /> : <DueCell task={task} />) },
    {
      key: 'owner',
      header: 'Owner',
      hideBelow: 'md',
      cell: (task) =>
        task.primary_owner ? (
          <span className="inline-flex items-center gap-2 text-text-secondary">
            <Avatar name={task.primary_owner.display_name || task.primary_owner.email} src={task.primary_owner.avatar_url} size={20} />
            <span className="max-w-[9rem] truncate">{task.primary_owner.display_name || task.primary_owner.email}</span>
          </span>
        ) : (
          <span className="text-text-muted">Unassigned</span>
        ),
    },
  ]
  if (canAccept) {
    columns.push({ key: 'accept', header: '', align: 'right', cell: (task) => (!task.primary_owner_id ? <AcceptTaskButton taskId={task.id} /> : null) })
  }
  if (selectable) {
    const manageable = tasks.filter((t) => canEditDate(t))
    const ids = manageable.map((t) => t.id)
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds!.has(id))
    columns.unshift({
      key: 'select',
      header: ids.length > 0 ? (
        <label className="-m-3.5 flex cursor-pointer items-center justify-center p-3.5">
          <input type="checkbox" aria-label="Select all manageable tasks" checked={allSelected} onChange={(e) => onToggleAll!(ids, e.target.checked)} className="h-4 w-4 accent-accent-blue" />
        </label>
      ) : null,
      cell: (task) =>
        canEditDate(task) ? (
          <label className="-m-3.5 flex cursor-pointer items-center justify-center p-3.5">
            <input type="checkbox" aria-label={`Select ${task.title || 'task'}`} checked={selectedIds!.has(task.id)} onChange={() => onToggle!(task.id)} className="h-4 w-4 accent-accent-blue" />
          </label>
        ) : null,
    })
  }

  return (
    <>
      <DataTable
        caption="Tasks"
        columns={columns}
        rows={tasks}
        rowKey={(t) => t.id}
        emptyState={<EmptyState icon={ListChecks} title={emptyTitle} description={emptyDescription} />}
      />
      {currentUserId && (
        <TaskPreviewDrawer task={previewTask} open={previewTask !== null} onClose={() => setPreviewId(null)} currentUserId={currentUserId} canManage={previewTask ? canManageTask(previewTask) : false} canReschedule={canReschedule} />
      )}
    </>
  )
}

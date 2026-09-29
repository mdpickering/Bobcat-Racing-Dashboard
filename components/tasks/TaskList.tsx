'use client'

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
import { createClient } from '@/lib/supabase/client'
import { updateTask } from '@/lib/supabase/queries/tasks'
import { getErrorMessage } from '@/lib/errors'
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
      {overdue && <span className="ml-1.5 text-[11px] uppercase tracking-wide">overdue</span>}
      {soon && <span className="ml-1.5 text-[11px] uppercase tracking-wide">soon</span>}
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
      className="w-auto py-1"
      onChange={async (e) => {
        try {
          await updateTask(createClient(), task.id, { status: e.target.value })
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
  canAccept = false,
  emptyTitle = 'No tasks match these filters',
  emptyDescription = 'Try adjusting or clearing your filters.',
  selectedIds,
  onToggle,
  onToggleAll,
}: TaskListProps) {
  const selectable = Boolean(selectedIds && onToggle && onToggleAll)
  const canManageTask = (task: Task) => isAdmin || ledSubsystemIds.includes(task.subsystem_id)
  const canEditStatus = (task: Task) => canManageTask(task) || Boolean(currentUserId && task.assignees?.some((a) => a.user_id === currentUserId))

  const columns: Column<Task>[] = [
    {
      key: 'task',
      header: 'Task',
      cell: (task) => (
        <>
          <Link href={`/tasks/${task.id}`} className="block max-w-[34rem] truncate font-medium text-text-primary hover:text-accent-blue">
            {task.title || 'Untitled task'}
          </Link>
          {/* the separator is drawn by CSS after the first item, so a wrapped line never starts with a stray dot */}
          <div className="meta-dots mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-text-muted">
            <span className="min-w-0 max-w-full truncate">{task.subsystem?.name ?? 'Unknown'}</span>
            {task.category?.name && <span className="min-w-0 max-w-full truncate">{task.category.name}</span>}
          </div>
          {/* on phones the due date and badges fold into the first column, each on its own line */}
          <div className="mt-1 text-xs sm:hidden">{canManageTask(task) ? <InlineDateEditor taskId={task.id} deadline={task.deadline} status={task.status} /> : <DueCell task={task} />}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:hidden">
            <PriorityBadge priority={task.priority} />
            <StatusCell task={task} editable={canEditStatus(task)} />
          </div>
        </>
      ),
    },
    { key: 'priority', header: 'Priority', hideBelow: 'sm', cell: (task) => <PriorityBadge priority={task.priority} /> },
    { key: 'status', header: 'Status', hideBelow: 'sm', cell: (task) => <StatusCell task={task} editable={canEditStatus(task)} /> },
    { key: 'due', header: 'Due', hideBelow: 'sm', cell: (task) => (canManageTask(task) ? <InlineDateEditor taskId={task.id} deadline={task.deadline} status={task.status} /> : <DueCell task={task} />) },
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
    const manageable = tasks.filter((t) => canManageTask(t))
    const ids = manageable.map((t) => t.id)
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds!.has(id))
    columns.unshift({
      key: 'select',
      header: ids.length > 0 ? (
        <label className="-m-2 flex cursor-pointer items-center justify-center p-2">
          <input type="checkbox" aria-label="Select all manageable tasks" checked={allSelected} onChange={(e) => onToggleAll!(ids, e.target.checked)} className="h-4 w-4 accent-accent-blue" />
        </label>
      ) : null,
      cell: (task) =>
        canManageTask(task) ? (
          <label className="-m-2 flex cursor-pointer items-center justify-center p-2">
            <input type="checkbox" aria-label={`Select ${task.title || 'task'}`} checked={selectedIds!.has(task.id)} onChange={() => onToggle!(task.id)} className="h-4 w-4 accent-accent-blue" />
          </label>
        ) : null,
    })
  }

  return (
    <DataTable
      caption="Tasks"
      columns={columns}
      rows={tasks}
      rowKey={(t) => t.id}
      emptyState={<EmptyState icon={ListChecks} title={emptyTitle} description={emptyDescription} />}
    />
  )
}

import Link from 'next/link'
import { ListChecks } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import DataTable, { type Column } from '@/components/ui/DataTable'
import Avatar from '@/components/ui/Avatar'
import { StatusBadge, PriorityBadge } from '@/components/tasks/TaskBadges'
import AcceptTaskButton from '@/components/tasks/AcceptTaskButton'
import { formatDeadline, isDeadlineDueSoon, isDeadlineOverdue } from '@/lib/deadline'
import type { Task } from '@/types/database'

interface TaskListProps {
  tasks: Task[]
  // Whether the viewer may accept an unassigned task in this list for themselves (server-side
  // authorization in accept_task/migration 0024 is the real gate — this just decides whether to
  // show the button at all, e.g. the subsystem page passes true only for its own members).
  canAccept?: boolean
  emptyTitle?: string
  emptyDescription?: string
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

export default function TaskList({ tasks, canAccept = false, emptyTitle = 'No tasks match these filters', emptyDescription = 'Try adjusting or clearing your filters.' }: TaskListProps) {
  const columns: Column<Task>[] = [
    {
      key: 'task',
      header: 'Task',
      cell: (task) => (
        <>
          <Link href={`/tasks/${task.id}`} className="block max-w-[34rem] truncate font-medium text-text-primary hover:text-accent-blue">
            {task.title || 'Untitled task'}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-text-muted">
            <span>{task.subsystem?.name ?? 'Unknown'}</span>
            {task.category?.name && <span>· {task.category.name}</span>}
            {/* on phones the due date and badges fold into the first column */}
            <span className="sm:hidden">
              · <DueCell task={task} />
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 sm:hidden">
            <PriorityBadge priority={task.priority} />
            <StatusBadge status={task.status} />
          </div>
        </>
      ),
    },
    { key: 'priority', header: 'Priority', hideBelow: 'sm', cell: (task) => <PriorityBadge priority={task.priority} /> },
    { key: 'status', header: 'Status', hideBelow: 'sm', cell: (task) => <StatusBadge status={task.status} /> },
    { key: 'due', header: 'Due', hideBelow: 'sm', cell: (task) => <DueCell task={task} /> },
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
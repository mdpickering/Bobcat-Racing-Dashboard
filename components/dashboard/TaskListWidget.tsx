import Link from 'next/link'
import { StatusBadge, PriorityBadge } from '@/components/tasks/TaskBadges'
import { formatDeadline, isDeadlineOverdue } from '@/lib/deadline'
import type { Task } from '@/types/database'

interface TaskGroupProps {
  title: string
  tasks: Task[]
  viewAllHref?: string
  // how many rows to show before "View all"
  limit?: number
}

// One urgency group of the dashboard's "needs attention" list: a heading with a count, then compact rows.
// Groups with nothing in them are not rendered by the page, so there are no empty boxes.
export default function TaskGroup({ title, tasks, viewAllHref, limit = 5 }: TaskGroupProps) {
  const shown = tasks.slice(0, limit)
  return (
    <section aria-label={title}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">
          {title} <span className="ml-1 text-xs font-normal text-text-muted">{tasks.length}</span>
        </h3>
        {viewAllHref && tasks.length > shown.length && (
          <Link href={viewAllHref} className="text-xs text-accent-blue hover:underline">
            View all {tasks.length}
          </Link>
        )}
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {shown.map((task) => {
          const overdue = isDeadlineOverdue(task.deadline, task.status)
          return (
            <li key={task.id}>
              <Link href={`/tasks/${task.id}`} className="flex items-center justify-between gap-3 px-3 py-2 text-xs transition-colors hover:bg-surface-raised">
                <div className="min-w-0">
                  <div className="truncate font-medium text-text-primary">{task.title}</div>
                  <div className="mt-0.5 truncate text-xs text-text-muted">
                    {task.subsystem?.name ?? 'Unknown subsystem'}
                    {task.deadline && (
                      <span className={overdue ? 'font-medium text-status-danger' : ''}>
                        {' · '}
                        {overdue ? 'Overdue, was due ' : 'Due '}
                        {formatDeadline(task.deadline)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="hidden flex-shrink-0 items-center gap-1.5 sm:flex">
                  <PriorityBadge priority={task.priority} />
                  <StatusBadge status={task.status} />
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
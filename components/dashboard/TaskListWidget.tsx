import Link from 'next/link'
import Panel from '@/components/ui/Panel'
import EmptyState from '@/components/ui/EmptyState'
import { StatusBadge, PriorityBadge } from '@/components/tasks/TaskBadges'
import { formatDeadline } from '@/lib/deadline'
import type { Task } from '@/types/database'
import { ClipboardList } from 'lucide-react'

interface TaskListWidgetProps {
  title: string
  tasks: Task[]
  emptyMessage: string
  viewAllHref?: string
}

export default function TaskListWidget({ title, tasks, emptyMessage, viewAllHref }: TaskListWidgetProps) {
  return (
    <Panel className="flex flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wide text-text-primary">{title}</h3>
        {viewAllHref && tasks.length > 0 && (
          <Link href={viewAllHref} className="text-[10px] font-mono uppercase text-accent-blue hover:underline">
            View all
          </Link>
        )}
      </div>
      {tasks.length === 0 ? (
        <EmptyState icon={ClipboardList} title={emptyMessage} />
      ) : (
        <ul className="space-y-1.5">
          {tasks.slice(0, 6).map((task) => (
            <li key={task.id}>
              <Link
                href={`/tasks/${task.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-transparent px-2.5 py-2 text-xs transition-colors hover:border-border hover:bg-surface-raised"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-text-primary">{task.title}</div>
                  <div className="mt-0.5 truncate text-[10px] text-text-muted">
                    {task.subsystem?.name ?? 'Unknown subsystem'}
                    {task.deadline ? ` · Due ${formatDeadline(task.deadline)}` : ''}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  <PriorityBadge priority={task.priority} />
                  <StatusBadge status={task.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

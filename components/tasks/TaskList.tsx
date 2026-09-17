import Link from 'next/link'
import EmptyState from '@/components/ui/EmptyState'
import Panel from '@/components/ui/Panel'
import Avatar from '@/components/ui/Avatar'
import { StatusBadge, PriorityBadge } from '@/components/tasks/TaskBadges'
import { formatDate, isOverdue } from '@/lib/format'
import type { Task } from '@/types/database'
import { ListChecks } from 'lucide-react'

export default function TaskList({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) {
    return <EmptyState icon={ListChecks} title="No tasks match these filters" description="Try adjusting or clearing your filters." />
  }

  return (
    <Panel className="overflow-hidden">
      <ul className="divide-y divide-border">
        {tasks.map((task) => (
          <li key={task.id}>
            <Link href={`/tasks/${task.id}`} className="flex items-center gap-3 px-4 py-3 text-xs transition-colors hover:bg-surface-raised">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-text-primary">{task.title}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-text-muted">
                  <span>{task.subsystem?.name ?? 'Unknown'}</span>
                  {task.category?.name && <span>· {task.category.name}</span>}
                  {task.deadline && (
                    <span className={isOverdue(task.deadline, task.status) ? 'font-semibold text-rose-400' : ''}>
                      · Due {formatDate(task.deadline)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                {task.primary_owner && <Avatar name={task.primary_owner.display_name || task.primary_owner.email} src={task.primary_owner.avatar_url} size={22} />}
                <PriorityBadge priority={task.priority} />
                <StatusBadge status={task.status} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

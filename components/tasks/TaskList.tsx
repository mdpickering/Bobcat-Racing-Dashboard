import Link from 'next/link'
import EmptyState from '@/components/ui/EmptyState'
import Panel from '@/components/ui/Panel'
import Avatar from '@/components/ui/Avatar'
import { StatusBadge, PriorityBadge } from '@/components/tasks/TaskBadges'
import AcceptTaskButton from '@/components/tasks/AcceptTaskButton'
import { formatDeadline, isDeadlineOverdue } from '@/lib/deadline'
import type { Task } from '@/types/database'
import { ListChecks } from 'lucide-react'

interface TaskListProps {
  tasks: Task[]
  // Whether the viewer may accept an unassigned task in this list for themselves (server-side
  // authorization in accept_task/migration 0024 is the real gate — this just decides whether to
  // show the button at all, e.g. the subsystem page passes true only for its own members).
  canAccept?: boolean
}

export default function TaskList({ tasks, canAccept = false }: TaskListProps) {
  if (tasks.length === 0) {
    return <EmptyState icon={ListChecks} title="No tasks match these filters" description="Try adjusting or clearing your filters." />
  }

  return (
    <Panel className="overflow-hidden">
      <ul className="divide-y divide-border">
        {tasks.map((task) => {
          const showAccept = canAccept && !task.primary_owner_id
          return (
            <li key={task.id}>
              {/* The Accept button needs to sit outside the row's own link so the two clickable
                  elements don't nest (a <button> inside an <a> is invalid and unreliable to
                  click) — the title/meta area stays the link, the right-hand cluster is a sibling. */}
              <div className="flex items-center gap-3 px-4 py-3 text-xs transition-colors hover:bg-surface-raised">
                <Link href={`/tasks/${task.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-text-primary">{task.title}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-text-muted">
                    <span>{task.subsystem?.name ?? 'Unknown'}</span>
                    {task.category?.name && <span>· {task.category.name}</span>}
                    {task.deadline && (
                      <span className={isDeadlineOverdue(task.deadline, task.status) ? 'font-semibold text-rose-400' : ''}>
                        · Due {formatDeadline(task.deadline)}
                      </span>
                    )}
                  </div>
                </Link>
                <Link href={`/tasks/${task.id}`} className="flex flex-shrink-0 items-center gap-2">
                  {task.primary_owner && <Avatar name={task.primary_owner.display_name || task.primary_owner.email} src={task.primary_owner.avatar_url} size={22} />}
                  <PriorityBadge priority={task.priority} />
                  <StatusBadge status={task.status} />
                </Link>
                {showAccept && <AcceptTaskButton taskId={task.id} />}
              </div>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

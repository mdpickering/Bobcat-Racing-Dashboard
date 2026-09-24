'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CalendarClock } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { StatusBadge, PriorityBadge } from '@/components/tasks/TaskBadges'
import { createClient } from '@/lib/supabase/client'
import { rescheduleTask, type SchedulingTask } from '@/lib/supabase/queries/operations'
import { deadlineDateKey, formatDeadline, isDeadlineOverdue } from '@/lib/deadline'
import { getErrorMessage } from '@/lib/errors'

function DeadlineRow({ task }: { task: SchedulingTask }) {
  const router = useRouter()
  const current = deadlineDateKey(task.deadline) ?? ''
  const [value, setValue] = useState(current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(next: string | null) {
    setBusy(true)
    setError(null)
    try {
      await rescheduleTask(createClient(), task.id, next)
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not reschedule this task.'))
    } finally {
      setBusy(false)
    }
  }

  const overdue = isDeadlineOverdue(task.deadline, task.status)

  return (
    <li className="px-4 py-3 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-56">
          <Link href={`/tasks/${task.id}`} className="block truncate font-medium text-text-primary hover:text-accent-blue">
            {task.title}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-text-muted">
            <span>{task.subsystem?.name ?? 'Unknown'}</span>
            <span>· {task.primary_owner ? task.primary_owner.display_name || task.primary_owner.email : 'Unassigned'}</span>
            <span className={overdue ? 'font-semibold text-rose-400' : ''}>
              · {task.deadline ? `Due ${formatDeadline(task.deadline)}` : 'No deadline'}
            </span>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <PriorityBadge priority={task.priority} />
          <StatusBadge status={task.status} />
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <input
            type="date"
            aria-label={`Deadline for ${task.title}`}
            value={value}
            disabled={busy}
            onChange={(e) => setValue(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1 font-mono text-[11px] text-text-primary outline-none focus:border-accent-blue"
          />
          <Button size="sm" disabled={busy || !value || value === current} onClick={() => save(value)}>
            {busy ? 'Saving…' : 'Reschedule'}
          </Button>
          {current && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => save(null)}>
              Clear
            </Button>
          )}
        </div>
      </div>
      {error && <p className="mt-1.5 text-[11px] text-rose-400">{error}</p>}
    </li>
  )
}

interface TaskDeadlineTableProps {
  tasks: SchedulingTask[]
  emptyTitle: string
}

// Deadline-only editing for the Operations view: each row calls reschedule_task(), which changes
// nothing else about the task.
export default function TaskDeadlineTable({ tasks, emptyTitle }: TaskDeadlineTableProps) {
  if (tasks.length === 0) return <EmptyState icon={CalendarClock} title={emptyTitle} />
  return (
    <Panel className="overflow-hidden">
      <ul className="divide-y divide-border">
        {tasks.map((t) => (
          <DeadlineRow key={t.id} task={t} />
        ))}
      </ul>
    </Panel>
  )
}

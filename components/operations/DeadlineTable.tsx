import Link from 'next/link'
import DataTable, { type Column } from '@/components/ui/DataTable'
import { StatusBadge, PriorityBadge } from '@/components/tasks/TaskBadges'
import RescheduleControl from './RescheduleControl'
import { formatDeadline } from '@/lib/deadline'
import { relativeDeadline, type DeadlineBucket } from '@/lib/operationsSchedule'
import type { SchedulingTask } from '@/lib/supabase/queries/operations'
import type { TaskStatus, TaskPriority } from '@/types/database'

const ownerName = (t: SchedulingTask) => (t.primary_owner ? t.primary_owner.display_name || t.primary_owner.email || 'Unknown' : null)

interface DeadlineTableProps {
  tasks: SchedulingTask[]
  today: string
  bucket: DeadlineBucket
  compact?: boolean
  // Optional bulk-selection column (Operations → Deadlines only; the compact dashboard view omits
  // these three props and gets the table exactly as before).
  selectedIds?: Set<string>
  onToggle?: (id: string) => void
  onToggleAll?: (ids: string[], checked: boolean) => void
}

// One group of deadlines (Overdue, Today, …). Dates use the existing date-only rules (lib/deadline.ts). The reschedule
// control is the deadline-only edit the Operations view already had.
export default function DeadlineTable({ tasks, today, bucket, compact = false, selectedIds, onToggle, onToggleAll }: DeadlineTableProps) {
  const selectable = Boolean(selectedIds && onToggle && onToggleAll)
  const columns: Column<SchedulingTask>[] = [
    {
      key: 'due',
      header: 'Due',
      cell: (t) => (
        <div className="whitespace-nowrap">
          <div className={bucket === 'overdue' ? 'font-medium text-status-danger' : 'font-medium text-text-primary'}>{t.deadline ? formatDeadline(t.deadline, { weekday: 'short', month: 'short', day: 'numeric' }) : '—'}</div>
          <div className={`text-xs ${bucket === 'overdue' ? 'text-status-danger' : 'text-text-muted'}`}>{relativeDeadline(t.deadline, today)}</div>
        </div>
      ),
    },
    {
      key: 'task',
      header: 'Task',
      cell: (t) => (
        <>
          <Link href={`/tasks/${t.id}`} className={`block truncate font-medium text-text-primary hover:text-accent-blue ${compact ? 'max-w-[11rem] sm:max-w-[22rem]' : 'max-w-[11rem] sm:max-w-[28rem]'}`}>
            {t.title || 'Untitled task'}
          </Link>
          <div className={`mt-0.5 text-xs text-text-muted ${compact ? '' : 'md:hidden'}`}>
            {t.subsystem?.name ?? 'Unknown'} · {ownerName(t) ?? 'Unassigned'}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:hidden">
            <StatusBadge status={t.status as TaskStatus} />
          </div>
          {!compact && (
            <div className="mt-2 max-w-[13rem] sm:max-w-none 2xl:hidden">
              <RescheduleControl taskId={t.id} title={t.title} deadline={t.deadline} />
            </div>
          )}
        </>
      ),
    },
    ...(compact ? [] : [{ key: 'subsystem', header: 'Subsystem', hideBelow: 'md' as const, cell: (t: SchedulingTask) => <span className="text-text-secondary">{t.subsystem?.name ?? 'Unknown'}</span> }]),
    ...(compact ? [] : [{ key: 'owner', header: 'Owner', hideBelow: 'md' as const, cell: (t: SchedulingTask) => (ownerName(t) ? <span className="text-text-secondary">{ownerName(t)}</span> : <span className="text-text-muted">Unassigned</span>) }]),
    { key: 'status', header: 'Status', hideBelow: 'sm', cell: (t) => <StatusBadge status={t.status as TaskStatus} /> },
    ...(compact ? [] : [{ key: 'priority', header: 'Priority', hideBelow: 'lg' as const, cell: (t: SchedulingTask) => <PriorityBadge priority={t.priority as TaskPriority} /> }]),
  ]
  if (!compact) {
    columns.push({ key: 'reschedule', header: 'Reschedule', hideBelow: '2xl', cell: (t) => <RescheduleControl taskId={t.id} title={t.title} deadline={t.deadline} /> })
  }
  if (selectable) {
    const ids = tasks.map((t) => t.id)
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds!.has(id))
    columns.unshift({
      key: 'select',
      header: (
        <label className="-m-2 flex cursor-pointer items-center justify-center p-2">
          <input type="checkbox" aria-label={`Select all in ${bucket}`} checked={allSelected} onChange={(e) => onToggleAll!(ids, e.target.checked)} className="h-4 w-4 accent-accent-blue" />
        </label>
      ),
      cell: (t) => (
        <label className="-m-2 flex cursor-pointer items-center justify-center p-2">
          <input type="checkbox" aria-label={`Select ${t.title || 'task'}`} checked={selectedIds!.has(t.id)} onChange={() => onToggle!(t.id)} className="h-4 w-4 accent-accent-blue" />
        </label>
      ),
    })
  }
  return <DataTable caption="Deadlines" columns={columns} rows={tasks} rowKey={(t) => t.id} />
}

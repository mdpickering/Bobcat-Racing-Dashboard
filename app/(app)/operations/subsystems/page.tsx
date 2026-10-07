import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { listOpenSchedulingTasks } from '@/lib/supabase/queries/operations'
import { listCalendarEventsInRange, listMilestonesInRange } from '@/lib/supabase/queries/calendar'
import { listSubsystems } from '@/lib/supabase/queries/subsystems'
import { todayDateKey } from '@/lib/deadline'
import { addDaysToKey, sortByAttention, subsystemSchedule, type SubsystemScheduleRow } from '@/lib/operationsSchedule'
import PageHeader from '@/components/ui/PageHeader'
import SectionHeader from '@/components/ui/SectionHeader'
import MetricStrip from '@/components/ui/MetricStrip'
import DataTable, { type Column } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import StatusBadge from '@/components/ui/StatusBadge'
import Panel from '@/components/ui/Panel'
import { BarList } from '@/components/ui/Charts'
import ErrorState from '@/components/ui/ErrorState'
import { Boxes } from 'lucide-react'

export const metadata = { title: 'Subsystem schedule' }

const DAY_MS = 24 * 60 * 60 * 1000

const shortDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export default async function SubsystemSchedulePage() {
  const supabase = createClient()
  const now = new Date()
  const today = todayDateKey(now)

  let tasks, subsystems, events, milestones
  try {
    ;[tasks, subsystems, events, milestones] = await Promise.all([
      listOpenSchedulingTasks(supabase),
      listSubsystems(supabase),
      listCalendarEventsInRange(supabase, now.toISOString(), new Date(now.getTime() + 90 * DAY_MS).toISOString()),
      listMilestonesInRange(supabase, today, addDaysToKey(today, 180)),
    ])
  } catch {
    return <ErrorState message="Could not load the subsystem schedule." />
  }

  const rows = sortByAttention(subsystemSchedule(subsystems, tasks, events, milestones, today, now))
  const needAttention = rows.filter((r) => r.attention.length > 0).length
  const total = (pick: (r: SubsystemScheduleRow) => number) => rows.reduce((a, r) => a + pick(r), 0)

  const columns: Column<SubsystemScheduleRow>[] = [
    {
      key: 'name',
      header: 'Subsystem',
      cell: (r) => (
        <>
          <Link href={`/subsystems/${r.subsystemId}`} className="font-medium text-text-primary hover:text-accent-blue">
            {r.name}
          </Link>
          {/* narrow screens: what needs attention folds under the name */}
          <div className="mt-1 flex flex-wrap gap-1.5 lg:hidden">{attentionBadges(r)}</div>
        </>
      ),
    },
    { key: 'open', header: 'Open', align: 'right', cell: (r) => <span className="text-text-primary">{r.open}</span> },
    { key: 'overdue', header: 'Overdue', align: 'right', cell: (r) => <span className={r.overdue > 0 ? 'font-medium text-status-danger' : 'text-text-muted'}>{r.overdue}</span> },
    { key: 'due7', header: 'Due in 7d', align: 'right', hideBelow: 'sm', cell: (r) => <span className={r.dueNext7 > 0 ? 'text-status-warning' : 'text-text-muted'}>{r.dueNext7}</span> },
    { key: 'none', header: 'No deadline', align: 'right', hideBelow: 'sm', cell: (r) => <span className={r.noDeadline > 0 ? 'text-text-primary' : 'text-text-muted'}>{r.noDeadline}</span> },
    {
      key: 'next',
      header: 'Next deadline',
      hideBelow: 'md',
      cell: (r) =>
        r.nextDeadline ? (
          <Link href={`/tasks/${r.nextDeadline.taskId}`} className="block max-w-[14rem] hover:text-accent-blue">
            <span className="tabular-nums text-text-primary">{shortDate(r.nextDeadline.key)}</span>
            <span className="block truncate text-xs text-text-muted">{r.nextDeadline.title}</span>
          </Link>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    {
      key: 'event',
      header: 'Next event',
      hideBelow: '2xl',
      cell: (r) =>
        r.nextEvent ? (
          <span className="block max-w-[12rem]">
            <span className="tabular-nums text-text-primary">{new Date(r.nextEvent.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            <span className="block truncate text-xs text-text-muted">{r.nextEvent.title}</span>
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    {
      key: 'milestone',
      header: 'Next milestone',
      hideBelow: '2xl',
      cell: (r) =>
        r.nextMilestone ? (
          <span className="block max-w-[12rem]">
            <span className="tabular-nums text-text-primary">{shortDate(r.nextMilestone.key)}</span>
            <span className="block truncate text-xs text-text-muted">{r.nextMilestone.name}</span>
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    { key: 'attention', header: 'Needs attention', hideBelow: 'lg', cell: (r) => <div className="flex flex-wrap gap-1.5">{attentionBadges(r)}</div> },
  ]

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Subsystem schedule"
        description="Where each subsystem stands on open work, deadlines, events and milestones. Read from existing tasks, calendar events and milestones."
      />

      <MetricStrip
        className="mb-6"
        metrics={[
          { label: 'Subsystems needing attention', value: String(needAttention), hint: `of ${rows.length}`, tone: needAttention > 0 ? 'warning' : undefined },
          { label: 'Open tasks', value: String(total((r) => r.open)) },
          { label: 'Overdue', value: String(total((r) => r.overdue)), tone: total((r) => r.overdue) > 0 ? 'danger' : undefined },
          { label: 'Due in 7 days', value: String(total((r) => r.dueNext7)) },
          { label: 'No deadline', value: String(total((r) => r.noDeadline)), tone: total((r) => r.noDeadline) > 0 ? 'warning' : undefined },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState icon={Boxes} title="No active subsystems" description="Subsystems appear here once an admin creates them." />
      ) : (
        <div className="grid grid-cols-1 gap-8 2xl:grid-cols-[minmax(0,1fr)_18rem]">
          <section aria-label="Schedule by subsystem" className="min-w-0">
            <SectionHeader title="By subsystem" description="Most in need of a look first: overdue, then unscheduled, then busiest." />
            <DataTable caption="Schedule by subsystem" columns={columns} rows={rows} rowKey={(r) => r.subsystemId} />
            <p className="mt-2 text-xs text-text-muted">
              “Needs attention” means exactly one of two things: open tasks past their deadline, or open tasks with no deadline. There is no score. Events and milestones shown are the next ones assigned to that subsystem; team-wide ones are not attributed to any subsystem.
            </p>
          </section>

          <aside aria-label="Load" className="space-y-4">
            <div>
              <SectionHeader title="Open tasks by subsystem" />
              <Panel className="p-4">
                {total((r) => r.open) === 0 ? (
                  <p className="text-xs text-text-secondary">No open tasks.</p>
                ) : (
                  <BarList ariaLabel="Open tasks by subsystem" items={[...rows].sort((a, b) => b.open - a.open).filter((r) => r.open > 0).map((r) => ({ label: r.name, value: r.open, href: `/subsystems/${r.subsystemId}` }))} />
                )}
              </Panel>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

function attentionBadges(r: SubsystemScheduleRow) {
  if (r.attention.length === 0) return <span className="text-xs text-text-muted">{r.open === 0 ? 'No open tasks' : 'Nothing flagged'}</span>
  return r.attention.map((a) =>
    a.kind === 'overdue' ? (
      <StatusBadge key="o" tone="danger">{a.count} overdue</StatusBadge>
    ) : (
      <StatusBadge key="u" tone="warning">{a.count} without a deadline</StatusBadge>
    )
  )
}

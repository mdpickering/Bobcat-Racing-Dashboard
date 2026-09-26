import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { listCalendarEventsInRange, listMilestonesInRange, listRecurringEvents } from '@/lib/supabase/queries/calendar'
import { listOpenSchedulingTasks } from '@/lib/supabase/queries/operations'
import { listSubsystems } from '@/lib/supabase/queries/subsystems'
import { canManageOperations } from '@/lib/permissions/roles'
import { deadlineCounts, groupDeadlines, sortByAttention, subsystemSchedule, bucketFor, addDaysToKey, type AgendaItem } from '@/lib/operationsSchedule'
import { deadlineDateKey, todayDateKey } from '@/lib/deadline'
import { formatDate } from '@/lib/format'
import type { Profile } from '@/types/user'
import PageHeader from '@/components/ui/PageHeader'
import SectionHeader from '@/components/ui/SectionHeader'
import MetricStrip from '@/components/ui/MetricStrip'
import Panel from '@/components/ui/Panel'
import StatusBadge from '@/components/ui/StatusBadge'
import DataTable, { type Column } from '@/components/ui/DataTable'
import ErrorState, { PermissionDeniedState } from '@/components/ui/ErrorState'
import CalendarToolbar from '@/components/calendar/CalendarToolbar'
import AgendaList from '@/components/operations/AgendaList'
import DeadlineTable from '@/components/operations/DeadlineTable'
import type { SubsystemScheduleRow } from '@/lib/operationsSchedule'

const DAY_MS = 24 * 60 * 60 * 1000

const keyLabel = (key: string) => {
  const [y, m, d] = key.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export default async function OperationsPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  if (!profileRow) return <ErrorState message="Could not load your profile." />
  const profile = profileRow as Profile

  // The database (migration 0028) is the real boundary; this just shows a clear message instead
  // of an empty shell to a member or team lead who follows the link.
  if (!canManageOperations(profile)) {
    return <PermissionDeniedState message="Operations is limited to the COO, CTO and Admin accounts." />
  }

  const now = new Date()
  const today = todayDateKey(now)
  const in14 = new Date(now.getTime() + 14 * DAY_MS)
  const in30 = new Date(now.getTime() + 30 * DAY_MS)

  let subsystems, openTasks, events30, milestones30, recurring
  try {
    ;[subsystems, openTasks, events30, milestones30, recurring] = await Promise.all([
      listSubsystems(supabase),
      listOpenSchedulingTasks(supabase),
      listCalendarEventsInRange(supabase, now.toISOString(), in30.toISOString()),
      listMilestonesInRange(supabase, today, addDaysToKey(today, 30)),
      listRecurringEvents(supabase),
    ])
  } catch {
    return <ErrorState message="Could not load the operations overview." />
  }

  const counts = deadlineCounts(openTasks, today)
  const overdue = groupDeadlines(openTasks, today).find((g) => g.bucket === 'overdue')!.tasks
  const unscheduled = openTasks.filter((t) => !t.deadline)
  const dueThisWeek = counts.today + counts.tomorrow + counts.next_7
  const eventsNext14 = events30.filter((e) => new Date(e.start_time) <= in14).length
  const teamName = (id: string | null | undefined) => subsystems.find((s) => s.id === id)?.name ?? null

  // This week: real events and milestones, task deadlines in the next 7 days (date-only), and the weekly recurring events.
  const agenda: AgendaItem[] = [
    ...events30.map((e): AgendaItem => ({ id: e.id, kind: 'event', title: e.title, start: e.start_time, team: e.subsystem?.name ?? null, href: '/calendar' })),
    ...openTasks
      .filter((t) => ['today', 'tomorrow', 'next_7'].includes(bucketFor(t.deadline, today)))
      .map((t): AgendaItem => ({ id: t.id, kind: 'deadline', title: t.title, dateKey: deadlineDateKey(t.deadline) as string, team: t.subsystem?.name ?? null, href: `/tasks/${t.id}` })),
    ...milestones30.map((m): AgendaItem => ({ id: m.id, kind: 'milestone', title: m.name, dateKey: m.date.slice(0, 10), team: m.subsystem?.name ?? null, href: '/milestones' })),
    ...recurring.map((r): AgendaItem => ({ id: r.id, kind: 'recurring', title: r.title, weekday: r.day_of_week, timeLabel: r.time_label, team: r.subsystem?.name ?? null })),
  ]

  const laterEvents = events30.filter((e) => new Date(e.start_time).getTime() > now.getTime() + 7 * DAY_MS).slice(0, 5)
  const schedule = sortByAttention(subsystemSchedule(subsystems, openTasks, events30, milestones30, today, now))
  const attentionRows = schedule.filter((r) => r.attention.length > 0).slice(0, 6)

  const scheduleColumns: Column<SubsystemScheduleRow>[] = [
    {
      key: 'name',
      header: 'Subsystem',
      cell: (r) => (
        <Link href={`/subsystems/${r.subsystemId}`} className="font-medium text-text-primary hover:text-accent-blue">
          {r.name}
        </Link>
      ),
    },
    { key: 'open', header: 'Open', align: 'right', cell: (r) => r.open },
    { key: 'overdue', header: 'Overdue', align: 'right', cell: (r) => <span className={r.overdue > 0 ? 'font-medium text-status-danger' : 'text-text-muted'}>{r.overdue}</span> },
    { key: 'none', header: 'No deadline', align: 'right', hideBelow: 'sm', cell: (r) => <span className={r.noDeadline > 0 ? 'text-text-primary' : 'text-text-muted'}>{r.noDeadline}</span> },
    {
      key: 'attention',
      header: 'Needs attention',
      hideBelow: 'md',
      cell: (r) => (
        <div className="flex flex-wrap gap-1.5">
          {r.attention.map((a) =>
            a.kind === 'overdue' ? (
              <StatusBadge key="o" tone="danger">{a.count} overdue</StatusBadge>
            ) : (
              <StatusBadge key="u" tone="warning">{a.count} without a deadline</StatusBadge>
            )
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Operations"
        description="What is happening, what is coming up, and what needs scheduling."
        actions={<CalendarToolbar canManage subsystemOptions={subsystems} isCtoOrAdmin />}
      />

      <MetricStrip
        className="mb-8"
        metrics={[
          { label: 'Overdue deadlines', value: String(counts.overdue), tone: counts.overdue > 0 ? 'danger' : undefined, href: '/operations/deadlines?range=overdue' },
          { label: 'Due in 7 days', value: String(dueThisWeek), tone: dueThisWeek > 0 ? 'warning' : undefined, hint: 'including today', href: '/operations/deadlines?range=week' },
          { label: 'Events, next 14 days', value: String(eventsNext14), href: '/operations/events' },
          { label: 'Milestones, next 30 days', value: String(milestones30.length), href: '/milestones' },
          { label: 'Need a deadline', value: String(counts.none), tone: counts.none > 0 ? 'warning' : undefined, hint: 'open tasks', href: '/operations/deadlines?range=none' },
        ]}
      />

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-8">
          <section aria-label="This week">
            <SectionHeader
              title="This week"
              description="Events, task deadlines, milestones and weekly meetings for the next 7 days."
              actions={
                <Link href="/calendar" className="text-xs text-accent-blue hover:underline">
                  Open calendar
                </Link>
              }
            />
            <AgendaList items={agenda} days={7} emptyTitle="Nothing scheduled for the next 7 days" emptyText="Add an event or milestone with the buttons above, or set deadlines on open tasks." />
          </section>

          <section aria-label="Overdue deadlines">
            <SectionHeader
              title={`Overdue deadlines (${overdue.length})`}
              actions={
                overdue.length > 0 ? (
                  <Link href="/operations/deadlines?range=overdue" className="text-xs text-accent-blue hover:underline">
                    Reschedule on Deadlines
                  </Link>
                ) : undefined
              }
            />
            {overdue.length === 0 ? (
              <p className="rounded-xl border border-border bg-surface px-4 py-3 text-xs text-text-secondary">Nothing is overdue.</p>
            ) : (
              <>
                <DeadlineTable tasks={overdue.slice(0, 8)} today={today} bucket="overdue" compact />
                {overdue.length > 8 && (
                  <p className="mt-1.5 text-xs text-text-muted">
                    Showing 8 of {overdue.length}.{' '}
                    <Link href="/operations/deadlines?range=overdue" className="text-accent-blue hover:underline">
                      See all
                    </Link>
                  </p>
                )}
              </>
            )}
          </section>

          <section aria-label="Subsystem schedule">
            <SectionHeader
              title="Subsystem schedule"
              description="Subsystems with overdue or unscheduled work."
              actions={
                <Link href="/operations/subsystems" className="text-xs text-accent-blue hover:underline">
                  Full schedule
                </Link>
              }
            />
            {attentionRows.length === 0 ? (
              <p className="rounded-xl border border-border bg-surface px-4 py-3 text-xs text-text-secondary">
                {subsystems.length === 0 ? 'No active subsystems.' : 'No subsystem has overdue or unscheduled work.'}
              </p>
            ) : (
              <DataTable caption="Subsystems needing attention" columns={scheduleColumns} rows={attentionRows} rowKey={(r) => r.subsystemId} />
            )}
          </section>
        </div>

        <aside aria-label="Coming up" className="space-y-8">
          <section aria-label="Needs scheduling">
            <SectionHeader
              title={`Needs scheduling (${unscheduled.length})`}
              actions={
                unscheduled.length > 0 ? (
                  <Link href="/operations/deadlines?range=none" className="text-xs text-accent-blue hover:underline">
                    All
                  </Link>
                ) : undefined
              }
            />
            {unscheduled.length === 0 ? (
              <p className="rounded-xl border border-border bg-surface px-4 py-3 text-xs text-text-secondary">Every open task has a deadline.</p>
            ) : (
              <Panel className="divide-y divide-border overflow-hidden">
                {unscheduled.slice(0, 6).map((t) => (
                  <Link key={t.id} href={`/tasks/${t.id}`} className="block px-4 py-2.5 text-xs transition-colors hover:bg-surface-raised">
                    <span className="block truncate font-medium text-text-primary">{t.title || 'Untitled task'}</span>
                    <span className="block truncate text-text-muted">{t.subsystem?.name ?? 'Unknown'}</span>
                  </Link>
                ))}
              </Panel>
            )}
          </section>

          <section aria-label="Upcoming milestones">
            <SectionHeader title={`Milestones, next 30 days (${milestones30.length})`} actions={<Link href="/milestones" className="text-xs text-accent-blue hover:underline">All</Link>} />
            {milestones30.length === 0 ? (
              <p className="rounded-xl border border-border bg-surface px-4 py-3 text-xs text-text-secondary">No milestones in the next 30 days.</p>
            ) : (
              <Panel className="divide-y divide-border overflow-hidden">
                {milestones30.slice(0, 6).map((m) => (
                  <div key={m.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-xs">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-text-primary">{m.name}</span>
                      <span className="block truncate text-text-muted">{m.subsystem?.name ?? teamName(m.subsystem_id) ?? 'Team-wide'}</span>
                    </span>
                    <span className="flex-shrink-0 tabular-nums text-text-secondary">{keyLabel(m.date)}</span>
                  </div>
                ))}
              </Panel>
            )}
          </section>

          <section aria-label="Later events">
            <SectionHeader title="Later this month" description="Events after the next 7 days." actions={<Link href="/operations/events" className="text-xs text-accent-blue hover:underline">All events</Link>} />
            {laterEvents.length === 0 ? (
              <p className="rounded-xl border border-border bg-surface px-4 py-3 text-xs text-text-secondary">No further events in the next 30 days.</p>
            ) : (
              <Panel className="divide-y divide-border overflow-hidden">
                {laterEvents.map((e) => (
                  <div key={e.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-xs">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-text-primary">{e.title}</span>
                      <span className="block truncate text-text-muted">{e.subsystem?.name ?? 'Team-wide'}</span>
                    </span>
                    <span className="flex-shrink-0 tabular-nums text-text-secondary">{formatDate(e.start_time, { month: 'short', day: 'numeric' })}</span>
                  </div>
                ))}
              </Panel>
            )}
          </section>
        </aside>
      </div>

      <p className="mt-10 text-xs text-text-muted">
        The full month view and the master timeline live in{' '}
        <Link href="/calendar" className="text-accent-blue hover:underline">
          Calendar
        </Link>{' '}
        and{' '}
        <Link href="/timeline" className="text-accent-blue hover:underline">
          Timeline
        </Link>
        .
      </p>
    </div>
  )
}

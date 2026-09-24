import Link from 'next/link'
import { AlertTriangle, CalendarClock, CalendarDays, Flag } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { listCalendarEventsInRange, listMilestonesInRange, listTaskDeadlinesInRange, listRecurringEvents } from '@/lib/supabase/queries/calendar'
import { listTimelineColumns, listTimelineMilestones } from '@/lib/supabase/queries/timeline'
import { listOpenSchedulingTasks } from '@/lib/supabase/queries/operations'
import { listSubsystems } from '@/lib/supabase/queries/subsystems'
import { canManageOperations } from '@/lib/permissions/roles'
import { deadlineDateKey, formatDeadline, isDeadlineDueSoon, isDeadlineOverdue, todayDateKey } from '@/lib/deadline'
import { formatDate } from '@/lib/format'
import type { Profile } from '@/types/user'
import Panel from '@/components/ui/Panel'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState, { PermissionDeniedState } from '@/components/ui/ErrorState'
import AdminStatCard from '@/components/admin/AdminStatCard'
import MonthCalendar from '@/components/calendar/MonthCalendar'
import RecurringEventsPanel from '@/components/calendar/RecurringEventsPanel'
import CalendarToolbar from '@/components/calendar/CalendarToolbar'
import TimelineGrid from '@/components/timeline/TimelineGrid'
import TimelineToolbar from '@/components/timeline/TimelineToolbar'
import TaskDeadlineTable from '@/components/operations/TaskDeadlineTable'

const DAY_MS = 24 * 60 * 60 * 1000

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-text-primary">{children}</h2>
}

export default async function OperationsPage({ searchParams }: { searchParams: { [key: string]: string | undefined } }) {
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
  const year = searchParams.year ? Number(searchParams.year) : now.getFullYear()
  const month = searchParams.month ? Number(searchParams.month) - 1 : now.getMonth()
  const rangeStart = new Date(year, month, 1)
  const rangeEnd = new Date(year, month + 1, 0, 23, 59, 59)
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  // Task deadlines are date-only midnight-UTC values (lib/deadline.ts) — month bounds are UTC too.
  const deadlineRangeStart = new Date(Date.UTC(year, month, 1)).toISOString()
  const deadlineRangeEnd = new Date(Date.UTC(year, month + 1, 1) - 1).toISOString()

  const in14Days = new Date(now.getTime() + 14 * DAY_MS)
  const in30Days = new Date(now.getTime() + 30 * DAY_MS)

  let subsystems, events, milestones, taskDeadlines, recurringEvents, upcomingEvents, upcomingMilestones, openTasks, activeColumns, allColumns, timelineCells
  try {
    ;[subsystems, events, milestones, taskDeadlines, recurringEvents, upcomingEvents, upcomingMilestones, openTasks, activeColumns, allColumns, timelineCells] = await Promise.all([
      listSubsystems(supabase),
      listCalendarEventsInRange(supabase, rangeStart.toISOString(), rangeEnd.toISOString()),
      listMilestonesInRange(supabase, key(rangeStart), key(rangeEnd)),
      listTaskDeadlinesInRange(supabase, deadlineRangeStart, deadlineRangeEnd),
      listRecurringEvents(supabase),
      listCalendarEventsInRange(supabase, now.toISOString(), in30Days.toISOString()),
      listMilestonesInRange(supabase, todayDateKey(now), key(in30Days)),
      listOpenSchedulingTasks(supabase),
      listTimelineColumns(supabase),
      listTimelineColumns(supabase, true),
      listTimelineMilestones(supabase),
    ])
  } catch {
    return <ErrorState message="Could not load the operations overview." />
  }

  const overdue = openTasks.filter((t) => isDeadlineOverdue(t.deadline, t.status))
  const dueSoon = openTasks.filter((t) => isDeadlineDueSoon(t.deadline, t.status, 14, now))
  const unscheduled = openTasks.filter((t) => !t.deadline)
  const dueThisWeek = openTasks.filter((t) => isDeadlineDueSoon(t.deadline, t.status, 7, now)).length
  const eventsNext14 = upcomingEvents.filter((e) => new Date(e.start_time) <= in14Days).length

  const overview = subsystems.map((s) => {
    const mine = openTasks.filter((t) => t.subsystem_id === s.id)
    const dated = mine.filter((t) => t.deadline).sort((a, b) => (deadlineDateKey(a.deadline)! < deadlineDateKey(b.deadline)! ? -1 : 1))
    const next = dated.find((t) => !isDeadlineOverdue(t.deadline, t.status))
    return {
      subsystem: s,
      open: mine.length,
      overdue: mine.filter((t) => isDeadlineOverdue(t.deadline, t.status)).length,
      dueSoon: mine.filter((t) => isDeadlineDueSoon(t.deadline, t.status, 7, now)).length,
      unscheduled: mine.filter((t) => !t.deadline).length,
      next: next?.deadline ?? null,
    }
  })

  const canManage = true

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Operations</h1>
        <p className="mt-0.5 text-xs font-mono text-text-muted">
          Scheduling overview: calendar, events, timeline, milestones and task deadlines across every subsystem.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <AdminStatCard label="Overdue tasks" value={overdue.length} icon={AlertTriangle} tone="warning" />
        <AdminStatCard label="Due in 7 days" value={dueThisWeek} icon={CalendarClock} />
        <AdminStatCard label="Events, next 14 days" value={eventsNext14} icon={CalendarDays} href="/calendar" />
        <AdminStatCard label="Milestones, next 30 days" value={upcomingMilestones.length} icon={Flag} />
      </div>

      <section>
        <SectionHeading>Overdue deadlines ({overdue.length})</SectionHeading>
        <TaskDeadlineTable tasks={overdue} emptyTitle="Nothing is overdue" />
      </section>

      <section>
        <SectionHeading>Due in the next 14 days ({dueSoon.length})</SectionHeading>
        <TaskDeadlineTable tasks={dueSoon} emptyTitle="Nothing due in the next 14 days" />
      </section>

      <section>
        <SectionHeading>No deadline set ({unscheduled.length})</SectionHeading>
        <TaskDeadlineTable tasks={unscheduled.slice(0, 15)} emptyTitle="Every open task has a deadline" />
        {unscheduled.length > 15 && <p className="mt-1.5 text-[11px] text-text-muted">Showing 15 of {unscheduled.length}.</p>}
      </section>

      <section>
        <SectionHeading>Subsystem scheduling overview</SectionHeading>
        <Panel className="overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-xs">
            <thead>
              <tr className="border-b border-border text-left text-[10px] font-mono uppercase text-text-muted">
                <th className="p-3 font-medium">Subsystem</th>
                <th className="p-3 text-right font-medium">Open</th>
                <th className="p-3 text-right font-medium">Overdue</th>
                <th className="p-3 text-right font-medium">Due in 7d</th>
                <th className="p-3 text-right font-medium">No deadline</th>
                <th className="p-3 font-medium">Next deadline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {overview.map((o) => (
                <tr key={o.subsystem.id}>
                  <td className="p-3 font-medium">
                    <Link href={`/subsystems/${o.subsystem.id}`} className="text-text-primary hover:text-accent-blue">
                      {o.subsystem.name}
                    </Link>
                  </td>
                  <td className="p-3 text-right text-text-secondary">{o.open}</td>
                  <td className={`p-3 text-right ${o.overdue > 0 ? 'font-semibold text-rose-400' : 'text-text-secondary'}`}>{o.overdue}</td>
                  <td className="p-3 text-right text-text-secondary">{o.dueSoon}</td>
                  <td className="p-3 text-right text-text-secondary">{o.unscheduled}</td>
                  <td className="p-3 text-text-secondary">{o.next ? formatDeadline(o.next) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </section>

      <section>
        <SectionHeading>Calendar</SectionHeading>
        <div className="space-y-3">
          <CalendarToolbar canManage={canManage} subsystemOptions={subsystems} isCtoOrAdmin={canManage} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <MonthCalendar
                year={year}
                month={month}
                events={events}
                milestones={milestones}
                taskDeadlines={taskDeadlines}
                canEditSubsystemIds={new Set<string>()}
                isCtoOrAdmin={canManage}
                basePath="/operations"
              />
            </div>
            <div>
              <RecurringEventsPanel
                recurringEvents={recurringEvents}
                canManage={canManage}
                subsystemOptions={subsystems}
                isCtoOrAdmin={canManage}
                canEditSubsystemIds={new Set<string>()}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <SectionHeading>Upcoming events, next 30 days ({upcomingEvents.length})</SectionHeading>
          {upcomingEvents.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No events in the next 30 days" />
          ) : (
            <Panel className="overflow-hidden">
              <ul className="divide-y divide-border">
                {upcomingEvents.map((e) => (
                  <li key={e.id} className="px-4 py-2.5 text-xs">
                    <div className="font-medium text-text-primary">{e.title}</div>
                    <div className="mt-0.5 text-[10px] text-text-muted">
                      {new Date(e.start_time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · {e.subsystem?.name ?? 'Team-wide'}
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
        <div>
          <SectionHeading>Upcoming milestones, next 30 days ({upcomingMilestones.length})</SectionHeading>
          {upcomingMilestones.length === 0 ? (
            <EmptyState icon={Flag} title="No milestones in the next 30 days" />
          ) : (
            <Panel className="overflow-hidden">
              <ul className="divide-y divide-border">
                {upcomingMilestones.map((m) => (
                  <li key={m.id} className="px-4 py-2.5 text-xs">
                    <div className="font-medium text-text-primary">{m.name}</div>
                    <div className="mt-0.5 text-[10px] text-text-muted">
                      {formatDate(`${m.date.slice(0, 10)}T12:00:00`)} · {m.subsystem?.name ?? 'Team-wide'}
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </section>

      <section>
        <SectionHeading>Master timeline</SectionHeading>
        <div className="space-y-3">
          <TimelineToolbar isCtoOrAdmin={canManage} allColumns={allColumns} />
          <TimelineGrid columns={activeColumns} subsystems={subsystems} milestones={timelineCells} canEditSubsystemIds={new Set<string>()} isCtoOrAdmin={canManage} />
        </div>
      </section>
    </div>
  )
}

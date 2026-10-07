import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { listCalendarEventsInRange, listRecurringEvents } from '@/lib/supabase/queries/calendar'
import { listSubsystems } from '@/lib/supabase/queries/subsystems'
import PageHeader from '@/components/ui/PageHeader'
import SectionHeader from '@/components/ui/SectionHeader'
import Tabs from '@/components/ui/Tabs'
import FilterBar from '@/components/ui/FilterBar'
import MetricStrip from '@/components/ui/MetricStrip'
import DataTable, { type Column } from '@/components/ui/DataTable'
import ErrorState from '@/components/ui/ErrorState'
import CalendarToolbar from '@/components/calendar/CalendarToolbar'
import EventsList from '@/components/operations/EventsList'
import type { RecurringEvent } from '@/types/database'

export const metadata = { title: 'Events' }

const DAY_MS = 24 * 60 * 60 * 1000
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default async function EventsPage({ searchParams }: { searchParams: { [key: string]: string | undefined } }) {
  const supabase = createClient()
  const view = searchParams.view === 'past' ? 'past' : 'upcoming'
  const now = new Date()
  const start = view === 'past' ? new Date(now.getTime() - 180 * DAY_MS) : now
  const end = view === 'past' ? now : new Date(now.getTime() + 180 * DAY_MS)

  let events, upcomingSoon, recurring, subsystems
  try {
    ;[events, upcomingSoon, recurring, subsystems] = await Promise.all([
      listCalendarEventsInRange(supabase, start.toISOString(), end.toISOString()),
      listCalendarEventsInRange(supabase, now.toISOString(), new Date(now.getTime() + 14 * DAY_MS).toISOString()),
      listRecurringEvents(supabase),
      listSubsystems(supabase),
    ])
  } catch {
    return <ErrorState message="Could not load events." />
  }

  // an event that already ended is "past"; one still running counts as upcoming
  const inView = events.filter((e) => (view === 'past' ? new Date(e.end_time).getTime() < now.getTime() : new Date(e.end_time).getTime() >= now.getTime()))
  const team = searchParams.subsystem
  const shown = inView.filter((e) => (team === 'team' ? !e.subsystem_id : team ? e.subsystem_id === team : true))

  const recurringColumns: Column<RecurringEvent>[] = [
    { key: 'day', header: 'Every', cell: (r) => <span className="font-medium text-text-primary">{DAYS[r.day_of_week] ?? '—'}</span> },
    { key: 'time', header: 'Time', cell: (r) => <span className="text-text-secondary">{r.time_label || '—'}</span> },
    { key: 'title', header: 'Event', cell: (r) => <span className="text-text-primary">{r.title}</span> },
    { key: 'team', header: 'Team', hideBelow: 'sm', cell: (r) => <span className="text-text-secondary">{r.subsystem?.name ?? 'Team-wide'}</span> },
  ]

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Events"
        description="Team events and meetings from the calendar. Edit or remove an event from the calendar itself."
        actions={<CalendarToolbar canManage subsystemOptions={subsystems} isCtoOrAdmin />}
      >
        <Tabs
          label="Event views"
          tabs={[
            { label: 'Upcoming', href: '/operations/events', active: view === 'upcoming' },
            { label: 'Past', href: '/operations/events?view=past', active: view === 'past' },
          ]}
        />
      </PageHeader>

      <MetricStrip
        className="mb-6"
        metrics={[
          { label: 'Next 14 days', value: String(upcomingSoon.length), hint: upcomingSoon.length === 1 ? 'event' : 'events' },
          { label: view === 'past' ? 'Past, last 180 days' : 'Upcoming, next 180 days', value: String(inView.length) },
          { label: 'Recurring weekly', value: String(recurring.length) },
        ]}
      />

      <div className="mb-4">
        <FilterBar
          fields={[
            {
              key: 'subsystem',
              allLabel: 'All teams',
              className: 'sm:w-52',
              options: [{ value: 'team', label: 'Team-wide only' }, ...subsystems.map((s) => ({ value: s.id, label: s.name }))],
            },
          ]}
        />
      </div>

      <EventsList
        events={shown}
        order={view === 'past' ? 'desc' : 'asc'}
        emptyTitle={view === 'past' ? 'No past events in the last 180 days' : 'No upcoming events'}
        emptyDescription={team ? 'No events for that team in this range. Try All teams.' : view === 'past' ? 'Events that have ended appear here.' : 'Add one with New event, or check the recurring meetings below.'}
      />

      <section aria-label="Recurring events" className="mt-10">
        <SectionHeader
          title="Recurring events"
          description="Weekly meetings from the calendar."
          actions={
            <Link href="/calendar" className="text-xs text-accent-blue hover:underline">
              Manage in calendar
            </Link>
          }
        />
        {recurring.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface px-4 py-3 text-xs text-text-secondary">No recurring events are set up. Add them from the calendar.</p>
        ) : (
          <DataTable caption="Recurring events" columns={recurringColumns} rows={recurring} rowKey={(r) => r.id} />
        )}
      </section>
    </div>
  )
}

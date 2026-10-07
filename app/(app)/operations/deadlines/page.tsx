import { createClient } from '@/lib/supabase/server'
import { listOpenSchedulingTasks } from '@/lib/supabase/queries/operations'
import { listSubsystems } from '@/lib/supabase/queries/subsystems'
import { todayDateKey } from '@/lib/deadline'
import { bucketFor, deadlineCounts, groupDeadlines, type DeadlineBucket } from '@/lib/operationsSchedule'
import PageHeader from '@/components/ui/PageHeader'
import MetricStrip from '@/components/ui/MetricStrip'
import FilterBar from '@/components/ui/FilterBar'
import ErrorState from '@/components/ui/ErrorState'
import DeadlinesBoard from '@/components/operations/DeadlinesBoard'

export const metadata = { title: 'Deadlines' }

const STATUSES = ['To Do', 'In Progress', 'Blocked', 'Review']
const RANGES: { value: string; label: string }[] = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Next 7 days' },
  { value: 'fortnight', label: 'Next 14 days' },
  { value: 'none', label: 'No deadline' },
]

const RANGE_BUCKETS: Record<string, DeadlineBucket[]> = {
  overdue: ['overdue'],
  today: ['today'],
  week: ['today', 'tomorrow', 'next_7'],
  fortnight: ['today', 'tomorrow', 'next_7', 'following_7'],
  none: ['none'],
}

// Rows shown for a group with no deadline can be long; cap it so the page stays scannable.
const NONE_CAP = 40

export default async function DeadlinesPage({ searchParams }: { searchParams: { [key: string]: string | undefined } }) {
  const supabase = createClient()

  let tasks, subsystems
  try {
    ;[tasks, subsystems] = await Promise.all([listOpenSchedulingTasks(supabase), listSubsystems(supabase)])
  } catch {
    return <ErrorState message="Could not load deadlines." />
  }

  const today = todayDateKey()
  const counts = deadlineCounts(tasks, today)

  // owners that actually appear on open tasks
  const owners = new Map<string, string>()
  for (const t of tasks) if (t.primary_owner) owners.set(t.primary_owner.id, t.primary_owner.display_name || t.primary_owner.email || 'Unknown')

  const { subsystem, status, owner, range } = searchParams
  const filtered = tasks.filter((t) => {
    if (subsystem && t.subsystem_id !== subsystem) return false
    if (status && t.status !== status) return false
    if (owner === 'none' ? t.primary_owner : owner && t.primary_owner?.id !== owner) return false
    if (range && RANGE_BUCKETS[range] && !RANGE_BUCKETS[range].includes(bucketFor(t.deadline, today))) return false
    return true
  })
  const isFiltered = Boolean(subsystem || status || owner || range)
  const groups = groupDeadlines(filtered, today).filter((g) => g.tasks.length > 0)

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Deadlines"
        description="Every open task by due date, across all subsystems. Deadlines are calendar dates; a task due today is not overdue."
      />

      <MetricStrip
        className="mb-6"
        metrics={[
          { label: 'Overdue', value: String(counts.overdue), tone: counts.overdue > 0 ? 'danger' : undefined },
          { label: 'Today', value: String(counts.today), tone: counts.today > 0 ? 'warning' : undefined },
          { label: 'Next 7 days', value: String(counts.tomorrow + counts.next_7), hint: 'after today' },
          { label: 'Later', value: String(counts.following_7 + counts.later), hint: '8 or more days out' },
          { label: 'No deadline', value: String(counts.none), tone: counts.none > 0 ? 'warning' : undefined },
        ]}
      />

      <div className="mb-6">
        <FilterBar
          fields={[
            { key: 'range', allLabel: 'Any date', className: 'sm:w-40', options: RANGES },
            { key: 'subsystem', allLabel: 'All subsystems', className: 'sm:w-48', options: subsystems.map((s) => ({ value: s.id, label: s.name })) },
            { key: 'status', allLabel: 'All statuses', chips: true, options: STATUSES.map((s) => ({ value: s, label: s })) },
            {
              key: 'owner',
              allLabel: 'All owners',
              className: 'sm:w-44',
              options: [{ value: 'none', label: 'Unassigned' }, ...[...owners.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({ value: id, label: name }))],
            },
          ]}
        />
      </div>

      <DeadlinesBoard groups={groups} isFiltered={isFiltered} noneCap={NONE_CAP} today={today} />
    </div>
  )
}

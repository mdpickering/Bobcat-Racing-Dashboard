import { Flag } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { listMilestonesInRange } from '@/lib/supabase/queries/calendar'
import { getCurrentCompetitionSettings } from '@/lib/supabase/queries/competition'
import { listSubsystems } from '@/lib/supabase/queries/subsystems'
import { canManageOperations } from '@/lib/permissions/roles'
import { todayDateKey } from '@/lib/deadline'
import type { Profile } from '@/types/user'
import type { Milestone } from '@/types/database'
import PageHeader from '@/components/ui/PageHeader'
import SectionHeader from '@/components/ui/SectionHeader'
import DataTable, { type Column } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import MilestonesToolbar from '@/components/calendar/MilestonesToolbar'

const DAY_MS = 24 * 60 * 60 * 1000

const keyToUtc = (key: string) => {
  const [y, m, d] = key.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const daysFromToday = (key: string, today: string) => Math.round((keyToUtc(key) - keyToUtc(today)) / DAY_MS)
const formatKey = (key: string) => new Date(keyToUtc(key)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

function When({ days }: { days: number }) {
  if (days === 0) return <span className="font-medium text-status-warning">Today</span>
  if (days === 1) return <span className="text-status-warning">Tomorrow</span>
  if (days > 0) return <span className="text-text-secondary">in {days} days</span>
  return <span className="text-text-muted">{Math.abs(days)} days ago</span>
}

export default async function MilestonesPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  if (!profileRow) return <ErrorState message="Could not load your profile." />
  const profile = profileRow as Profile

  const today = todayDateKey()
  const from = new Date(keyToUtc(today) - 365 * DAY_MS).toISOString().slice(0, 10)
  const to = new Date(keyToUtc(today) + 730 * DAY_MS).toISOString().slice(0, 10)

  const [subsystems, { data: leadRows }] = await Promise.all([
    listSubsystems(supabase),
    supabase.from('subsystem_members').select('subsystem_id').eq('user_id', profile.id).eq('is_lead', true),
  ])
  const ledSubsystemIds = new Set((leadRows ?? []).map((r) => r.subsystem_id as string))
  // same rule as the calendar page: whole-team schedule managers, or a lead for their own subsystem(s)
  const manageAll = canManageOperations(profile)
  const canManage = manageAll || ledSubsystemIds.size > 0
  const subsystemOptions = manageAll ? subsystems : subsystems.filter((s) => ledSubsystemIds.has(s.id))

  let milestones: Milestone[], competition
  try {
    ;[milestones, competition] = await Promise.all([listMilestonesInRange(supabase, from, to), getCurrentCompetitionSettings(supabase)])
  } catch {
    return <ErrorState message="Could not load milestones." />
  }

  const upcoming = milestones.filter((m) => m.date.slice(0, 10) >= today)
  const earlier = milestones.filter((m) => m.date.slice(0, 10) < today).reverse()

  // the season's own key dates, from Admin > Competition (only those that have been set)
  const seasonDates = competition
    ? [
        { label: 'Build start', date: competition.build_start },
        { label: 'Design freeze', date: competition.design_freeze },
        { label: 'Manufacturing start', date: competition.manufacturing_start },
        { label: 'Testing start', date: competition.testing_start },
        { label: competition.competition_name || 'Competition', date: competition.competition_date },
      ]
        .filter((d): d is { label: string; date: string } => Boolean(d.date))
        .sort((a, b) => a.date.localeCompare(b.date))
    : []

  const columns: Column<Milestone>[] = [
    { key: 'date', header: 'Date', cell: (m) => <span className="whitespace-nowrap font-medium text-text-primary">{formatKey(m.date)}</span> },
    { key: 'when', header: 'When', hideBelow: 'sm', cell: (m) => <When days={daysFromToday(m.date, today)} /> },
    {
      key: 'name',
      header: 'Milestone',
      cell: (m) => (
        <>
          <span className="font-medium text-text-primary">{m.name}</span>
          {m.description && <span className="mt-0.5 block max-w-xl truncate text-xs text-text-muted">{m.description}</span>}
        </>
      ),
    },
    { key: 'team', header: 'Team', hideBelow: 'md', cell: (m) => <span className="text-text-secondary">{m.subsystem?.name ?? 'Team-wide'}</span> },
  ]

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Milestones"
        description="Key dates for the build: the season's schedule and the milestones set by leads. They also appear on the calendar."
        actions={<MilestonesToolbar canManage={canManage} subsystemOptions={subsystemOptions} isCtoOrAdmin={manageAll} />}
      />

      <div className="space-y-8">
        <section aria-label="Season dates">
          <SectionHeader title="Season dates" description={competition ? `From the ${competition.competition_name || competition.season} settings.` : undefined} />
          {seasonDates.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface px-4 py-3 text-xs text-text-secondary">No season dates have been set yet. An admin sets them in Administration → Competition.</p>
          ) : (
            <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
              {seasonDates.map((d) => (
                <li key={d.label} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs">
                  <span className="font-medium text-text-primary">{d.label}</span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums text-text-secondary">{formatKey(d.date)}</span>
                    <span className="w-24 text-right">
                      <When days={daysFromToday(d.date, today)} />
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-label="Upcoming milestones">
          <SectionHeader title={`Upcoming milestones (${upcoming.length})`} />
          <DataTable
            caption="Upcoming milestones"
            columns={columns}
            rows={upcoming}
            rowKey={(m) => m.id}
            emptyState={<EmptyState icon={Flag} title="No upcoming milestones" description={canManage ? 'Add one with New milestone.' : 'Leads add milestones for their subsystems.'} />}
          />
        </section>

        {earlier.length > 0 && (
          <section aria-label="Earlier milestones">
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-text-primary">Earlier milestones ({earlier.length})</summary>
              <div className="mt-2.5">
                <DataTable caption="Earlier milestones" columns={columns} rows={earlier} rowKey={(m) => m.id} />
              </div>
            </details>
          </section>
        )}
      </div>
    </div>
  )
}

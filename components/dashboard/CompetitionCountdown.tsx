import { daysUntil, formatDate } from '@/lib/format'
import type { CompetitionSettings } from '@/types/database'

const KEY_DATES: { key: keyof CompetitionSettings; label: string }[] = [
  { key: 'design_freeze', label: 'Design freeze' },
  { key: 'manufacturing_start', label: 'Manufacturing start' },
  { key: 'testing_start', label: 'Testing start' },
]

// The season countdown: one large figure and the key dates that have been set. Renders inside a panel supplied by the page.
export default function CompetitionCountdown({ competition }: { competition: CompetitionSettings | null }) {
  if (!competition) {
    return <p className="text-xs text-text-muted">No competition season is configured yet.</p>
  }
  const days = daysUntil(competition.competition_date)
  return (
    <div>
      <div className="text-xs text-text-secondary">{competition.competition_name || `${competition.season} competition`}</div>
      {days !== null && (
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums leading-8 text-text-primary">{days >= 0 ? days : 0}</span>
          <span className="text-xs text-text-muted">{days >= 0 ? 'days remaining' : 'competition has passed'}</span>
        </div>
      )}
      <dl className="mt-2 space-y-1">
        {KEY_DATES.map((m) => {
          const value = competition[m.key] as string | null
          if (!value) return null
          return (
            <div key={m.key} className="flex items-center justify-between gap-3 text-xs">
              <dt className="text-text-secondary">{m.label}</dt>
              <dd className="tabular-nums text-text-primary">{formatDate(value)}</dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}
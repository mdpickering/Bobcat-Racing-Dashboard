import Panel from '@/components/ui/Panel'
import { daysUntil, formatDate } from '@/lib/format'
import type { CompetitionSettings } from '@/types/database'
import { Flag } from 'lucide-react'

const MILESTONES: { key: keyof CompetitionSettings; label: string }[] = [
  { key: 'design_freeze', label: 'Design Freeze' },
  { key: 'manufacturing_start', label: 'Manufacturing Start' },
  { key: 'testing_start', label: 'Testing Start' },
]

export default function CompetitionCountdown({ competition }: { competition: CompetitionSettings | null }) {
  if (!competition) {
    return (
      <Panel className="p-4">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-text-primary">Competition</h3>
        <p className="text-[11px] text-text-muted">No competition season configured yet.</p>
      </Panel>
    )
  }

  const days = daysUntil(competition.competition_date)

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Flag size={14} className="text-qu-gold" />
        <h3 className="text-xs font-bold uppercase tracking-wide text-text-primary">
          {competition.competition_name || `${competition.season} Competition`}
        </h3>
      </div>
      {days !== null && (
        <div className="mb-3">
          <div className="text-2xl font-black leading-none text-qu-gold">{days >= 0 ? days : 0}</div>
          <div className="text-[10px] font-mono uppercase tracking-wide text-text-muted">
            {days >= 0 ? 'days remaining' : 'competition has passed'}
          </div>
        </div>
      )}
      <div className="space-y-1.5 border-t border-border pt-3">
        {MILESTONES.map((m) => {
          const value = competition[m.key] as string | null
          if (!value) return null
          return (
            <div key={m.key} className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">{m.label}</span>
              <span className="font-mono text-text-primary">{formatDate(value)}</span>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

import { ListChecks } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { formatMoney, seasonLabel } from '@/lib/sponsorships'
import type { SponsorshipLevel } from '@/types/database'

// The season's program: its levels, their minimums and the standard deliverables each level receives.
export default function ProgramPanel({ season, levels }: { season: string; levels: SponsorshipLevel[] }) {
  return (
    <Panel className="p-4">
      <details>
        <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-text-primary">
          <ListChecks size={13} className="text-accent-blue" /> {seasonLabel(season)} program — {levels.length} levels and their deliverables
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {levels.map((level) => (
            <div key={level.id} className="rounded-lg border border-border p-3">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-semibold text-text-primary">
                  {level.name}
                  {!level.active && <span className="ml-1.5 text-[11px] font-normal text-text-muted">(inactive)</span>}
                </span>
                <span className="font-mono text-[12px] text-text-secondary">{formatMoney(level.min_amount)}+</span>
              </div>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[12px] text-text-secondary">
                {(level.deliverables ?? []).map((d) => (
                  <li key={d.id}>{d.title}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </Panel>
  )
}

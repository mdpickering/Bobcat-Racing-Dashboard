import { formatUsd } from '@/lib/parts'
import type { SpendGroup } from '@/lib/bomSpend'

// A ranked list where each row's bar is its share of the total. The figures are always written out beside the bar, so
// nothing depends on colour or length alone.
export default function SpendBars({ groups, ariaLabel, emptyText = 'No spending to show.' }: { groups: SpendGroup[]; ariaLabel: string; emptyText?: string }) {
  if (groups.length === 0) return <p className="text-xs text-text-muted">{emptyText}</p>
  return (
    <ul aria-label={ariaLabel} className="space-y-3">
      {groups.map((g) => (
        <li key={g.key}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate font-medium text-text-primary">{g.key}</span>
            <span className="flex-shrink-0 font-mono tabular-nums text-text-primary">
              {formatUsd(g.total)} <span className="ml-1 font-sans text-text-muted">{Math.round(g.share * 100)}%</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-text-secondary/15" aria-hidden="true">
            <div className="h-full rounded-full bg-gradient-to-r from-qu-gold to-amber-600" style={{ width: `${Math.max(g.share * 100, g.total > 0 ? 1 : 0)}%` }} />
          </div>
          <p className="mt-0.5 text-2xs text-text-muted">
            {g.lines} line{g.lines === 1 ? '' : 's'}
          </p>
        </li>
      ))}
    </ul>
  )
}

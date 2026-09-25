import Panel from '@/components/ui/Panel'
import { formatMoney } from '@/lib/sponsorships'
import type { SponsorshipListRow } from '@/lib/supabase/queries/sponsorships'

// Real totals for the selected season, summed from the database's own per-sponsorship figures. Only COMMITTED
// sponsorships count toward the money; prospects and declined ones are shown as a pipeline count instead.
export default function SeasonTotals({ rows }: { rows: SponsorshipListRow[] }) {
  const committed = rows.filter((r) => r.stage === 'committed')
  const inProgress = rows.filter((r) => ['prospect', 'contacted', 'interested'].includes(r.stage)).length
  const sum = (pick: (r: SponsorshipListRow) => number) => committed.reduce((a, r) => a + pick(r), 0)

  const cards = [
    { label: 'Total value', value: formatMoney(sum((r) => r.total_sponsorship_value)), hint: 'cash committed + in-kind' },
    { label: 'Cash committed', value: formatMoney(sum((r) => r.cash_committed)) },
    { label: 'Cash received', value: formatMoney(sum((r) => r.cash_received)) },
    { label: 'Cash outstanding', value: formatMoney(sum((r) => r.cash_outstanding)) },
    { label: 'In-kind value', value: formatMoney(sum((r) => r.in_kind_value)), hint: 'estimated, not cash' },
    { label: 'Committed sponsors', value: String(committed.length), hint: inProgress > 0 ? `${inProgress} in progress` : undefined },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((c) => (
        <Panel key={c.label} className="p-3">
          <div className="font-mono text-[11px] uppercase text-text-muted">{c.label}</div>
          <div className="mt-1 text-base font-bold text-text-primary">{c.value}</div>
          {c.hint && <div className="mt-0.5 text-[11px] text-text-muted">{c.hint}</div>}
        </Panel>
      ))}
    </div>
  )
}

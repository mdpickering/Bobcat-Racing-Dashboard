import MetricStrip from '@/components/ui/MetricStrip'
import { formatMoney } from '@/lib/sponsorships'
import type { SponsorshipListRow } from '@/lib/supabase/queries/sponsorships'

// Real totals for the selected season, summed from the database's own per-sponsorship figures. Only COMMITTED
// sponsorships count toward the money; prospects and declined ones are shown as a pipeline count instead.
export default function SeasonTotals({ rows }: { rows: SponsorshipListRow[] }) {
  const committed = rows.filter((r) => r.stage === 'committed')
  const inProgress = rows.filter((r) => ['prospect', 'contacted', 'interested'].includes(r.stage)).length
  const sum = (pick: (r: SponsorshipListRow) => number) => committed.reduce((a, r) => a + pick(r), 0)
  const outstanding = sum((r) => r.cash_outstanding)

  return (
    <MetricStrip
      metrics={[
        { label: 'Total value', value: formatMoney(sum((r) => r.total_sponsorship_value)), hint: 'cash committed + in-kind' },
        { label: 'Cash committed', value: formatMoney(sum((r) => r.cash_committed)) },
        { label: 'Cash received', value: formatMoney(sum((r) => r.cash_received)), tone: sum((r) => r.cash_received) > 0 ? 'success' : undefined },
        { label: 'Outstanding', value: formatMoney(outstanding), tone: outstanding > 0 ? 'warning' : undefined },
        { label: 'In-kind value', value: formatMoney(sum((r) => r.in_kind_value)), hint: 'estimated, not cash' },
        { label: 'Committed sponsors', value: String(committed.length), hint: inProgress > 0 ? `${inProgress} in progress` : undefined },
      ]}
    />
  )
}

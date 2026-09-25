import Link from 'next/link'
import { Handshake } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import EmptyState from '@/components/ui/EmptyState'
import { LevelBadge, ReviewBadge, StageBadge } from './SponsorshipBadges'
import { formatMoney } from '@/lib/sponsorships'
import type { SponsorshipListRow } from '@/lib/supabase/queries/sponsorships'
import type { SponsorshipLevel } from '@/types/database'

interface SponsorshipTableProps {
  rows: SponsorshipListRow[]
  levels: SponsorshipLevel[]
  filtered: boolean
}

// Deliverable tracking (status, assignee, due date) is added by a later update; until then the standard
// checklist for the sponsorship's level is what there is to show, so say that instead of inventing progress.
function deliverablesCell(row: SponsorshipListRow, levels: SponsorshipLevel[]) {
  const level = levels.find((l) => l.id === row.level_id)
  if (!level) return <span className="text-text-muted">—</span>
  const count = level.deliverables?.length ?? 0
  return (
    <span className="text-text-muted" title="Status tracking for deliverables is not switched on yet">
      {count} standard · not tracked yet
    </span>
  )
}

export default function SponsorshipTable({ rows, levels, filtered }: SponsorshipTableProps) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Handshake}
        title={filtered ? 'No sponsorships match these filters' : 'No sponsorships in this season'}
        description={filtered ? 'Try adjusting or clearing your filters.' : undefined}
      />
    )
  }

  return (
    <Panel className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[860px] text-left text-xs">
        <thead>
          <tr className="border-b border-border font-mono text-[10px] uppercase text-text-muted">
            <th className="px-4 py-2.5 font-medium">Sponsor</th>
            <th className="px-2 py-2.5 font-medium">Stage</th>
            <th className="px-2 py-2.5 font-medium">Level</th>
            <th className="px-2 py-2.5 text-right font-medium">Cash committed</th>
            <th className="px-2 py-2.5 text-right font-medium">Cash received</th>
            <th className="px-2 py-2.5 text-right font-medium">Outstanding</th>
            <th className="px-2 py-2.5 text-right font-medium">In-kind</th>
            <th className="px-2 py-2.5 font-medium">Deliverables</th>
            <th className="px-4 py-2.5 font-medium">Level review</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.sponsorship_id} className="transition-colors hover:bg-surface-raised">
              <td className="px-4 py-2.5">
                <Link href={`/business/sponsorships/${row.sponsorship_id}`} className="font-medium text-text-primary hover:text-accent-blue">
                  {row.sponsor_name}
                </Link>
              </td>
              <td className="px-2 py-2.5">
                <StageBadge stage={row.stage} />
              </td>
              <td className="px-2 py-2.5">
                <LevelBadge name={row.level_name} />
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums text-text-primary">{formatMoney(row.cash_committed)}</td>
              <td className="px-2 py-2.5 text-right tabular-nums text-text-primary">{formatMoney(row.cash_received)}</td>
              <td className={`px-2 py-2.5 text-right tabular-nums ${row.cash_outstanding > 0 ? 'text-amber-400' : 'text-text-muted'}`}>{formatMoney(row.cash_outstanding)}</td>
              <td className="px-2 py-2.5 text-right tabular-nums text-text-primary">{formatMoney(row.in_kind_value)}</td>
              <td className="px-2 py-2.5 text-[11px]">{deliverablesCell(row, levels)}</td>
              <td className="px-4 py-2.5">
                <ReviewBadge flag={row.review?.review_flag} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

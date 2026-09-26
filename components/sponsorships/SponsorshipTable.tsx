import Link from 'next/link'
import { Handshake } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import DataTable, { type Column } from '@/components/ui/DataTable'
import { LevelBadge, ReviewBadge, StageBadge } from './SponsorshipBadges'
import { formatMoney } from '@/lib/sponsorships'
import type { SponsorshipListRow } from '@/lib/supabase/queries/sponsorships'

interface SponsorshipTableProps {
  rows: SponsorshipListRow[]
  filtered: boolean
}

// Progress comes from the database view, which has no row for a sponsorship without deliverables, so a historical or
// not-yet-levelled sponsorship shows why there is nothing to track instead of a misleading "0 / 0".
function DeliverablesCell({ row }: { row: SponsorshipListRow }) {
  const p = row.deliverables
  if (p) {
    const allDone = p.completed === p.total
    return (
      <span className={`tabular-nums ${allDone ? 'font-medium text-status-success' : 'text-text-primary'}`} title={`${p.completed} of ${p.total} deliverables complete`}>
        {p.completed} / {p.total} <span className="font-normal text-text-muted">complete</span>
      </span>
    )
  }
  const flag = row.review?.review_flag
  if (flag === 'custom') return <span className="text-text-muted">None defined</span>
  if (!row.level_id) return <span className="text-text-muted">No level</span>
  return <span className="text-text-muted">—</span>
}

export default function SponsorshipTable({ rows, filtered }: SponsorshipTableProps) {
  const columns: Column<SponsorshipListRow>[] = [
    {
      key: 'sponsor',
      header: 'Sponsor',
      cell: (r) => (
        <>
          <Link href={`/business/sponsorships/${r.sponsorship_id}`} className="font-medium text-text-primary hover:text-accent-blue">
            {r.sponsor_name}
          </Link>
          {/* narrow screens: stage and level fold under the name */}
          <div className="mt-1 flex flex-wrap items-center gap-1.5 md:hidden">
            <StageBadge stage={r.stage} />
            <LevelBadge name={r.level_name} />
          </div>
        </>
      ),
    },
    { key: 'stage', header: 'Stage', hideBelow: 'md', cell: (r) => <StageBadge stage={r.stage} /> },
    { key: 'level', header: 'Level', hideBelow: 'md', cell: (r) => <LevelBadge name={r.level_name} /> },
    { key: 'committed', header: 'Cash committed', align: 'right', cell: (r) => <span className="text-text-primary">{formatMoney(r.cash_committed)}</span> },
    { key: 'received', header: 'Received', align: 'right', hideBelow: 'sm', cell: (r) => <span className="text-text-primary">{formatMoney(r.cash_received)}</span> },
    {
      key: 'outstanding',
      header: 'Outstanding',
      align: 'right',
      hideBelow: 'sm',
      cell: (r) => <span className={r.cash_outstanding > 0 ? 'font-medium text-status-warning' : 'text-text-muted'}>{formatMoney(r.cash_outstanding)}</span>,
    },
    { key: 'inkind', header: 'In-kind', align: 'right', hideBelow: 'lg', cell: (r) => <span className="text-text-primary">{formatMoney(r.in_kind_value)}</span> },
    { key: 'deliverables', header: 'Deliverables', hideBelow: 'lg', cell: (r) => <span className="text-xs"><DeliverablesCell row={r} /></span> },
    { key: 'review', header: 'Level review', hideBelow: 'md', cell: (r) => <ReviewBadge flag={r.review?.review_flag} /> },
  ]

  return (
    <DataTable
      caption="Sponsorships"
      density="comfortable"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.sponsorship_id}
      emptyState={
        <EmptyState
          icon={Handshake}
          title={filtered ? 'No sponsorships match these filters' : 'No sponsorships in this season'}
          description={filtered ? 'Try adjusting or clearing your filters.' : undefined}
        />
      }
    />
  )
}

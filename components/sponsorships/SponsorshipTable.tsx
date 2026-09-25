import Link from 'next/link'
import { Handshake } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import DataTable, { type Column } from '@/components/ui/DataTable'
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
function DeliverablesCell({ row, levels }: { row: SponsorshipListRow; levels: SponsorshipLevel[] }) {
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
    { key: 'deliverables', header: 'Deliverables', hideBelow: 'lg', cell: (r) => <span className="text-xs"><DeliverablesCell row={r} levels={levels} /></span> },
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

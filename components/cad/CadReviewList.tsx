import Link from 'next/link'
import { Ruler } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import DataTable, { type Column } from '@/components/ui/DataTable'
import Avatar from '@/components/ui/Avatar'
import CadStatusBadge from './CadStatusBadge'
import { formatDate } from '@/lib/format'
import type { CadReview } from '@/types/database'

export default function CadReviewList({ reviews, filtered = false }: { reviews: CadReview[]; filtered?: boolean }) {
  const columns: Column<CadReview>[] = [
    {
      key: 'review',
      header: 'Review',
      cell: (r) => (
        <>
          <Link href={`/cad/${r.id}`} className="block max-w-[32rem] truncate font-medium text-text-primary hover:text-accent-blue">
            {r.title || 'Untitled review'}
          </Link>
          <div className="mt-0.5 text-xs text-text-muted">
            {r.subsystem?.name ?? 'Unknown'} · Rev {r.current_revision}
            {r.task?.title ? ` · ${r.task.title}` : ''}
          </div>
          <div className="mt-1 sm:hidden">
            <CadStatusBadge status={r.status} />
          </div>
        </>
      ),
    },
    { key: 'status', header: 'Status', hideBelow: 'sm', cell: (r) => <CadStatusBadge status={r.status} /> },
    {
      key: 'submitter',
      header: 'Submitted by',
      hideBelow: 'md',
      cell: (r) => (
        <span className="inline-flex items-center gap-2 text-text-secondary">
          <Avatar name={r.submitter?.display_name || r.submitter?.email} src={r.submitter?.avatar_url} size={20} />
          <span className="max-w-[9rem] truncate">{r.submitter?.display_name || r.submitter?.email || 'Unknown'}</span>
        </span>
      ),
    },
    { key: 'created', header: 'Created', hideBelow: 'lg', cell: (r) => <span className="text-text-secondary">{formatDate(r.created_at)}</span> },
  ]

  return (
    <DataTable countLabel="reviews"
      caption="CAD reviews"
      columns={columns}
      rows={reviews}
      rowKey={(r) => r.id}
      emptyState={
        <EmptyState
          icon={Ruler}
          title={filtered ? 'No CAD reviews match these filters' : 'No CAD reviews yet'}
          description={filtered ? 'Try adjusting or clearing your filters.' : 'Submit a review when a design is ready for the team to check.'}
        />
      }
    />
  )
}

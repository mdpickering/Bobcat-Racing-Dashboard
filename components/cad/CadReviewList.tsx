import Link from 'next/link'
import { Ruler } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import Panel from '@/components/ui/Panel'
import Avatar from '@/components/ui/Avatar'
import CadStatusBadge from './CadStatusBadge'
import { formatDate } from '@/lib/format'
import type { CadReview } from '@/types/database'

export default function CadReviewList({ reviews }: { reviews: CadReview[] }) {
  if (reviews.length === 0) {
    return <EmptyState icon={Ruler} title="No CAD reviews match these filters" description="Try adjusting or clearing your filters." />
  }

  return (
    <Panel className="overflow-hidden">
      <ul className="divide-y divide-border">
        {reviews.map((review) => (
          <li key={review.id}>
            <Link href={`/cad/${review.id}`} className="flex items-center gap-3 px-4 py-3 text-xs transition-colors hover:bg-surface-raised">
              <div className="min-w-0 flex-1">
                <span className="truncate font-medium text-text-primary">{review.title}</span>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-text-muted">
                  <span>{review.subsystem?.name ?? 'Unknown'}</span>
                  <span>· Rev {review.current_revision}</span>
                  {review.task?.title && <span>· {review.task.title}</span>}
                  <span>· {formatDate(review.created_at)}</span>
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <Avatar name={review.submitter?.display_name || review.submitter?.email} src={review.submitter?.avatar_url} size={22} />
                <CadStatusBadge status={review.status} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

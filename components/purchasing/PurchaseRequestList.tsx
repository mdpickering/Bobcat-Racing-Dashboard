import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import Panel from '@/components/ui/Panel'
import PurchaseStatusBadge from './PurchaseStatusBadge'
import { formatDate } from '@/lib/format'
import type { PurchaseRequest } from '@/types/database'

export default function PurchaseRequestList({ requests }: { requests: PurchaseRequest[] }) {
  if (requests.length === 0) {
    return <EmptyState icon={ShoppingCart} title="No purchase requests match these filters" description="Try adjusting or clearing your filters." />
  }

  return (
    <Panel className="overflow-hidden">
      <ul className="divide-y divide-border">
        {requests.map((pr) => (
          <li key={pr.id}>
            <Link href={`/purchasing/${pr.id}`} className="flex items-center gap-3 px-4 py-3 text-xs transition-colors hover:bg-surface-raised">
              <div className="min-w-0 flex-1">
                <span className="truncate font-medium text-text-primary">{pr.title}</span>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-text-muted">
                  <span>{pr.subsystem?.name ?? 'Unknown'}</span>
                  {pr.vendor && <span>· {pr.vendor}</span>}
                  <span>· Requested by {pr.requester?.display_name || pr.requester?.email || 'Unknown'}</span>
                  <span>· {formatDate(pr.created_at)}</span>
                </div>
              </div>
              <PurchaseStatusBadge status={pr.status} />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

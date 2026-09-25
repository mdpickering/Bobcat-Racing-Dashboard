import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import Panel from '@/components/ui/Panel'
import PurchaseStatusBadge from './PurchaseStatusBadge'
import { formatDate } from '@/lib/format'
import type { PurchaseRequest } from '@/types/database'

// "3 items · McMaster, Amazon +1 · $412.30" — a team's order can span several vendors
function summary(pr: PurchaseRequest): string {
  const items = pr.items ?? []
  if (items.length === 0) return 'No items'
  const vendors = Array.from(new Set(items.map((i) => (i.vendor ?? pr.vendor ?? '').trim()).filter(Boolean)))
  const shown = vendors.slice(0, 2).join(', ')
  const extra = vendors.length > 2 ? ` +${vendors.length - 2}` : ''
  const total = items.reduce((sum, i) => sum + (i.unit_cost ?? 0) * i.quantity, 0)
  const parts = [`${items.length} item${items.length === 1 ? '' : 's'}`]
  if (vendors.length > 0) parts.push(shown + extra)
  if (total > 0) parts.push(total.toLocaleString(undefined, { style: 'currency', currency: 'USD' }))
  return parts.join(' · ')
}

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
                  <span>· {summary(pr)}</span>
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

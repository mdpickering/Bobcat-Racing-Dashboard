import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import DataTable, { type Column } from '@/components/ui/DataTable'
import PurchaseStatusBadge from './PurchaseStatusBadge'
import { formatDate } from '@/lib/format'
import type { PurchaseRequest } from '@/types/database'

// A team's order can span several vendors: list the first two and count the rest.
function vendorsOf(pr: PurchaseRequest): { shown: string; extra: number } {
  const vendors = Array.from(new Set((pr.items ?? []).map((i) => (i.vendor ?? pr.vendor ?? '').trim()).filter(Boolean)))
  return { shown: vendors.slice(0, 2).join(', '), extra: Math.max(vendors.length - 2, 0) }
}

function totalOf(pr: PurchaseRequest): number {
  return (pr.items ?? []).reduce((sum, i) => sum + (i.unit_cost ?? 0) * i.quantity, 0)
}

const money = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })

export default function PurchaseRequestList({ requests, filtered = false }: { requests: PurchaseRequest[]; filtered?: boolean }) {
  const columns: Column<PurchaseRequest>[] = [
    {
      key: 'request',
      header: 'Request',
      cell: (pr) => {
        const items = pr.items ?? []
        return (
          <>
            <Link href={`/purchasing/${pr.id}`} className="block max-w-[30rem] truncate font-medium text-text-primary hover:text-accent-blue">
              {pr.title || 'Untitled request'}
            </Link>
            <div className="mt-0.5 text-xs text-text-muted">
              {pr.subsystem?.name ?? 'Unknown'} · {items.length === 0 ? 'No items' : `${items.length} item${items.length === 1 ? '' : 's'}`}
            </div>
            <div className="mt-1 sm:hidden">
              <PurchaseStatusBadge status={pr.status} />
            </div>
          </>
        )
      },
    },
    {
      key: 'vendors',
      header: 'Vendors',
      hideBelow: 'md',
      cell: (pr) => {
        const v = vendorsOf(pr)
        return v.shown ? (
          <span className="text-text-secondary">
            {v.shown}
            {v.extra > 0 && <span className="text-text-muted"> +{v.extra}</span>}
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        )
      },
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      hideBelow: 'sm',
      cell: (pr) => (totalOf(pr) > 0 ? <span className="text-text-primary">{money(totalOf(pr))}</span> : <span className="text-text-muted">—</span>),
    },
    {
      key: 'requester',
      header: 'Requested by',
      hideBelow: 'lg',
      cell: (pr) => <span className="text-text-secondary">{pr.requester?.display_name || pr.requester?.email || 'Unknown'}</span>,
    },
    { key: 'date', header: 'Created', hideBelow: 'lg', cell: (pr) => <span className="text-text-secondary">{formatDate(pr.created_at)}</span> },
    { key: 'status', header: 'Status', hideBelow: 'sm', cell: (pr) => <PurchaseStatusBadge status={pr.status} /> },
  ]

  return (
    <DataTable countLabel="requests"
      caption="Purchase requests"
      density="comfortable"
      columns={columns}
      rows={requests}
      rowKey={(pr) => pr.id}
      emptyState={
        <EmptyState
          icon={ShoppingCart}
          title={filtered ? 'No purchase requests match these filters' : 'No purchase requests yet'}
          description={filtered ? 'Try adjusting or clearing your filters.' : 'Team leads create requests here; they are reviewed and approved before anything is ordered.'}
        />
      }
    />
  )
}

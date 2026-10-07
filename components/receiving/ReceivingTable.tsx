import Link from 'next/link'
import { PackageCheck } from 'lucide-react'
import DataTable, { type Column } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import Badge from '@/components/ui/Badge'
import PurchaseStatusBadge from '@/components/purchasing/PurchaseStatusBadge'
import ReceiveButton from './ReceiveButton'
import { formatDate } from '@/lib/format'
import type { PurchaseReceivingStatusRow } from '@/types/database'

interface ReceivingTableProps {
  rows: PurchaseReceivingStatusRow[]
  subsystemNames: Record<string, string>
  canReceive: (subsystemId: string) => boolean
  emptyTitle: string
  emptyDescription: string
  mode: 'needs' | 'recent'
}

// One row per purchase LINE (matching purchase_receiving_status directly). Receiving happens per REQUEST, so the
// action button opens the form for the line's whole request — it fetches every outstanding line on that request
// itself when it opens.
export default function ReceivingTable({ rows, subsystemNames, canReceive, emptyTitle, emptyDescription, mode }: ReceivingTableProps) {
  const columns: Column<PurchaseReceivingStatusRow>[] = [
    {
      key: 'request',
      header: 'Purchase request',
      cell: (r) => (
        <>
          <Link href={`/purchasing/${r.purchase_request_id}`} className="font-medium text-text-primary hover:text-accent-blue">
            {r.request_title}
          </Link>
          <div className="mt-0.5 text-text-secondary md:hidden">{r.description}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 lg:hidden">
            <Badge tone="neutral">{subsystemNames[r.subsystem_id] ?? r.subsystem_id}</Badge>
            <PurchaseStatusBadge status={r.request_status} />
          </div>
        </>
      ),
    },
    { key: 'subsystem', header: 'Subsystem', hideBelow: 'lg', cell: (r) => <span className="text-text-secondary">{subsystemNames[r.subsystem_id] ?? r.subsystem_id}</span> },
    { key: 'description', header: 'Part / description', hideBelow: 'md', cell: (r) => <span className="text-text-primary">{r.description}</span> },
    { key: 'ordered', header: 'Ordered', align: 'right', cell: (r) => <span className="text-text-secondary">{r.ordered_quantity}</span> },
    { key: 'received', header: 'Received', align: 'right', cell: (r) => <span className={r.accepted_quantity > 0 ? 'font-medium text-status-success' : 'text-text-muted'}>{r.accepted_quantity}</span> },
    { key: 'rejected', header: 'Rejected', align: 'right', hideBelow: 'md', cell: (r) => (r.rejected_quantity > 0 ? <span className="font-medium text-status-danger">{r.rejected_quantity}</span> : <span className="text-text-muted">—</span>) },
    { key: 'outstanding', header: 'Outstanding', align: 'right', cell: (r) => (r.outstanding_quantity > 0 ? <span className="font-medium text-status-warning">{r.outstanding_quantity}</span> : <span className="text-text-muted">0</span>) },
    { key: 'vendor', header: 'Vendor', hideBelow: 'lg', cell: (r) => <span className="text-text-secondary">{r.vendor ?? '—'}</span> },
    { key: 'status', header: 'Status', hideBelow: 'lg', cell: (r) => <PurchaseStatusBadge status={r.request_status} /> },
    { key: 'last_received', header: 'Last received', hideBelow: 'xl', cell: (r) => <span className="text-text-muted">{formatDate(r.last_received_on)}</span> },
    ...(mode === 'needs'
      ? [
          {
            key: 'action',
            header: '',
            cell: (r: PurchaseReceivingStatusRow) => (canReceive(r.subsystem_id) ? <ReceiveButton purchaseRequestId={r.purchase_request_id} requestTitle={r.request_title} /> : null),
          } as Column<PurchaseReceivingStatusRow>,
        ]
      : []),
  ]

  return (
    <DataTable countLabel="requests"
      caption={mode === 'needs' ? 'Needs receiving' : 'Recently received'}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.item_id}
      emptyState={<EmptyState icon={PackageCheck} title={emptyTitle} description={emptyDescription} />}
    />
  )
}

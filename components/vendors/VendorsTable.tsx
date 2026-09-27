import Link from 'next/link'
import { Store } from 'lucide-react'
import DataTable, { type Column } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import { CatalogStatusBadge } from '@/components/parts/PartsTable'
import { formatUsd } from '@/lib/parts'
import type { VendorOverview } from '@/types/database'

// Business-style vendor list: roomier rows, vendor first, contact and purchasing figures alongside. Below 768px the
// name carries status and contact under it.
export default function VendorsTable({ rows, filtered, canAdd }: { rows: VendorOverview[]; filtered: boolean; canAdd: boolean }) {
  const columns: Column<VendorOverview>[] = [
    {
      key: 'name',
      header: 'Vendor',
      cell: (r) => (
        <>
          <Link href={`/business/vendors/${r.id}`} className="font-medium text-text-primary hover:text-accent-blue">
            {r.name}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 md:hidden">
            <CatalogStatusBadge active={r.active} />
            <span className="text-[11px] text-text-muted">{r.part_count} part{r.part_count === 1 ? '' : 's'}</span>
          </div>
        </>
      ),
    },
    { key: 'status', header: 'Status', hideBelow: 'md', cell: (r) => <CatalogStatusBadge active={r.active} /> },
    {
      key: 'contact',
      header: 'Contact',
      hideBelow: 'md',
      cell: (r) =>
        r.contact_name || r.contact_email || r.contact_phone ? (
          <span className="text-text-secondary">
            {r.contact_name ?? ''}
            {r.contact_email && <span className="block text-[11px] text-text-muted">{r.contact_email}</span>}
            {!r.contact_email && r.contact_phone && <span className="block text-[11px] text-text-muted">{r.contact_phone}</span>}
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    {
      key: 'website',
      header: 'Website',
      hideBelow: 'lg',
      cell: (r) =>
        r.website ? (
          <a href={r.website} target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:underline">
            {r.website.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 32)}
          </a>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    { key: 'parts', header: 'Parts', align: 'right', hideBelow: 'md', cell: (r) => <span className="text-text-primary">{r.part_count}</span> },
    {
      key: 'activity',
      header: 'Purchasing',
      align: 'right',
      hideBelow: 'lg',
      cell: (r) => (r.purchase_items > 0 ? <span className="text-text-primary">{formatUsd(r.purchase_total)} <span className="text-text-muted">· {r.purchase_items} line{r.purchase_items === 1 ? '' : 's'}</span></span> : <span className="text-text-muted">—</span>),
    },
  ]

  return (
    <DataTable
      caption="Vendors"
      density="comfortable"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      rowClassName={(r) => (r.active ? '' : 'opacity-60')}
      emptyState={
        <EmptyState
          icon={Store}
          title={filtered ? 'No vendors match these filters' : 'No vendors yet'}
          description={filtered ? 'Try adjusting or clearing your filters.' : canAdd ? 'Add the first vendor with the button above.' : 'Business team members add vendors.'}
        />
      }
    />
  )
}

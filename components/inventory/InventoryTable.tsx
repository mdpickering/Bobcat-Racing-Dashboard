import Link from 'next/link'
import { Warehouse } from 'lucide-react'
import DataTable, { type Column } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import { CatalogStatusBadge } from '@/components/parts/PartsTable'
import { formatUsd } from '@/lib/inventory'
import type { InventoryOverviewRow } from '@/types/database'

// The inventory list: real data only. On order / on hand / stock value all come straight from the
// inventory_overview view — nothing here is estimated or invented.
export default function InventoryTable({ rows, filtered, hasLocations }: { rows: InventoryOverviewRow[]; filtered: boolean; hasLocations: boolean }) {
  const columns: Column<InventoryOverviewRow>[] = [
    {
      key: 'part',
      header: 'Part #',
      cell: (r) => (
        <>
          <Link href={`/parts/${r.part_id}`} className="font-mono text-[12px] font-medium text-text-primary hover:text-accent-blue">
            {r.part_number}
          </Link>
          <div className="mt-0.5 text-text-secondary md:hidden">{r.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 md:hidden">
            <CatalogStatusBadge active={r.active} />
            <span className="text-2xs text-text-muted">{r.subsystem_name}</span>
          </div>
        </>
      ),
    },
    { key: 'name', header: 'Part name', hideBelow: 'md', cell: (r) => <span className="text-text-primary">{r.name}</span> },
    { key: 'subsystem', header: 'Subsystem', hideBelow: 'lg', cell: (r) => <span className="text-text-secondary">{r.subsystem_name}</span> },
    { key: 'on_hand', header: 'On hand', align: 'right', cell: (r) => <span className={r.on_hand > 0 ? 'font-medium text-text-primary' : 'text-text-muted'}>{r.on_hand}</span> },
    { key: 'locations', header: 'Location count', align: 'right', hideBelow: 'lg', cell: (r) => <span className="text-text-secondary">{r.location_count}</span> },
    {
      key: 'location_names',
      header: 'Locations',
      hideBelow: 'xl',
      cell: (r) => (r.location_names ? <span className="text-text-secondary">{r.location_names}</span> : <span className="text-text-muted">—</span>),
    },
    {
      key: 'on_order',
      header: 'On order',
      align: 'right',
      hideBelow: 'md',
      cell: (r) => (r.on_order > 0 ? <span className="font-medium text-status-info">{r.on_order}</span> : <span className="text-text-muted">—</span>),
    },
    {
      key: 'cost',
      header: 'Unit cost',
      align: 'right',
      hideBelow: 'lg',
      cell: (r) => (r.missing_cost ? <span className="text-status-warning" title="No cost recorded">—</span> : <span className="text-text-primary">{formatUsd(r.effective_unit_cost)}</span>),
    },
    {
      key: 'value',
      header: 'Stock value',
      align: 'right',
      cell: (r) => (r.stock_value === null ? <span className="text-text-muted" title="No cost recorded — excluded from value">—</span> : <span className="text-text-primary">{formatUsd(r.stock_value)}</span>),
    },
    { key: 'status', header: 'Status', hideBelow: 'md', cell: (r) => <CatalogStatusBadge active={r.active} /> },
  ]

  return (
    <DataTable
      caption="Inventory"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.part_id}
      rowClassName={(r) => (r.active ? '' : 'opacity-60')}
      emptyState={
        <EmptyState
          icon={Warehouse}
          title={filtered ? 'No parts match these filters' : hasLocations ? 'No stock recorded yet' : 'No locations exist yet'}
          description={
            filtered
              ? 'Try adjusting or clearing your filters.'
              : hasLocations
                ? 'Stock appears here once a purchase is received, an opening balance is recorded, or parts are transferred in.'
                : 'Add a location first — an Admin, CTO or the COO can do this — then receive purchases or record an opening balance to start tracking stock.'
          }
        />
      }
    />
  )
}

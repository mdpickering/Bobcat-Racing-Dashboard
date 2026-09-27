import Link from 'next/link'
import { Cog } from 'lucide-react'
import DataTable, { type Column } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import StatusBadge from '@/components/ui/StatusBadge'
import { CATALOG_STATUS_LABEL, formatUsd } from '@/lib/parts'
import { formatDate } from '@/lib/format'
import { statusTone } from '@/lib/status'
import type { PartCatalogRow } from '@/types/database'

export function CatalogStatusBadge({ active }: { active: boolean }) {
  const key = active ? 'active' : 'inactive'
  return <StatusBadge tone={statusTone('catalog', key)}>{CATALOG_STATUS_LABEL[key]}</StatusBadge>
}

// The part table for engineering work: compact, the identifying columns first. Below 768px the columns that matter
// (part number, name, cost) stay and the rest fold under the name.
export default function PartsTable({ rows, filtered, canAdd }: { rows: PartCatalogRow[]; filtered: boolean; canAdd: boolean }) {
  const columns: Column<PartCatalogRow>[] = [
    {
      key: 'part',
      header: 'Part #',
      cell: (r) => (
        <>
          <Link href={`/parts/${r.id}`} className="font-mono text-[12px] font-medium text-text-primary hover:text-accent-blue">
            {r.part_number}
          </Link>
          <div className="mt-0.5 text-text-secondary md:hidden">{r.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 md:hidden">
            <CatalogStatusBadge active={r.active} />
            <span className="text-[11px] text-text-muted">{r.subsystem_name}</span>
          </div>
        </>
      ),
    },
    { key: 'name', header: 'Part name', hideBelow: 'md', cell: (r) => <span className="text-text-primary">{r.name}</span> },
    { key: 'subsystem', header: 'Subsystem', hideBelow: 'lg', cell: (r) => <span className="text-text-secondary">{r.subsystem_name}</span> },
    {
      key: 'manufacturer',
      header: 'Manufacturer',
      hideBelow: 'xl',
      cell: (r) =>
        r.manufacturer || r.manufacturer_part_number ? (
          <span className="text-text-secondary">
            {r.manufacturer ?? '—'}
            {r.manufacturer_part_number && <span className="ml-1 font-mono text-[11px] text-text-muted">{r.manufacturer_part_number}</span>}
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    {
      key: 'vendor',
      header: 'Vendor',
      hideBelow: 'md',
      cell: (r) =>
        r.vendor_count === 0 ? (
          <span className="text-text-muted">None</span>
        ) : (
          <span className="text-text-secondary">
            {r.preferred_vendor_name ?? `${r.vendor_count} vendor${r.vendor_count === 1 ? '' : 's'}`}
            {r.preferred_vendor_name && r.vendor_count > 1 && <span className="ml-1 text-[11px] text-text-muted">+{r.vendor_count - 1}</span>}
          </span>
        ),
    },
    {
      key: 'cost',
      header: 'Unit cost',
      align: 'right',
      cell: (r) => (r.missing_cost ? <span className="text-status-warning" title="No cost recorded">—</span> : <span className="text-text-primary">{formatUsd(r.effective_unit_cost)}</span>),
    },
    { key: 'status', header: 'Status', hideBelow: 'md', cell: (r) => <CatalogStatusBadge active={r.active} /> },
    { key: 'updated', header: 'Updated', hideBelow: 'xl', cell: (r) => <span className="text-text-muted">{formatDate(r.updated_at)}</span> },
  ]

  return (
    <DataTable
      caption="Parts"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      rowClassName={(r) => (r.active ? '' : 'opacity-60')}
      emptyState={
        <EmptyState
          icon={Cog}
          title={filtered ? 'No parts match these filters' : 'No parts yet'}
          description={filtered ? 'Try adjusting or clearing your filters.' : canAdd ? 'Add the first part with the button above.' : 'Subsystem leads and the CTO add parts to the catalog.'}
        />
      }
    />
  )
}

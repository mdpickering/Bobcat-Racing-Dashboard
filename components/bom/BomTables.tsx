import Link from 'next/link'
import { AlertTriangle, ExternalLink, Library } from 'lucide-react'
import DataTable, { type Column } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import StatusBadge from '@/components/ui/StatusBadge'
import { KIND_HINT, KIND_LABEL, KIND_TONE, formatOrderDate, kindOf, safeHttpUrl, type BomKind, type BomLine, type BomPart } from '@/lib/bom'
import { formatUsd } from '@/lib/parts'

const DASH = <span className="text-text-muted">—</span>

// Clicking a part number shows every line for that part, so "what did we pay last time" is one click away.
const historyHref = (partNumber: string) => `/bom?view=lines&q=${encodeURIComponent(partNumber)}`

function PartNumber({ value }: { value: string | null }) {
  if (!value) return DASH
  return (
    <Link href={historyHref(value)} className="touch-target inline-flex items-center font-mono text-[12px] font-medium text-text-primary hover:text-accent-blue" title="Show every line for this part">
      {value}
    </Link>
  )
}

function KindBadge({ kind }: { kind: BomKind }) {
  return (
    <span title={KIND_HINT[kind]}>
      <StatusBadge tone={KIND_TONE[kind]}>{KIND_LABEL[kind]}</StatusBadge>
    </span>
  )
}

function ProductLink({ href, label }: { href: string | null; label: string }) {
  const safe = safeHttpUrl(href)
  if (!safe) return null
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer" className="touch-target -my-3.5 -mr-4 ml-[-10px] inline-flex items-center justify-center px-4 align-middle text-accent-blue hover:underline" title="Open the product page">
      <ExternalLink size={12} aria-hidden="true" />
      <span className="sr-only">Open the product page for {label} (new tab)</span>
    </a>
  )
}

function ReviewNote({ text }: { text: string }) {
  return (
    <div className="mt-1 flex items-start gap-1 text-2xs leading-4 text-status-warning">
      <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
      <span>
        <span className="font-semibold">Check: </span>
        {text}
      </span>
    </div>
  )
}

function Empty({ filtered }: { filtered: boolean }) {
  return (
    <EmptyState
      icon={Library}
      title={filtered ? 'No parts match these filters' : 'The BOM has not been loaded yet'}
      description={filtered ? 'Try fewer words, or clear the filters.' : 'An admin loads the Master BOM data file once; it will appear here.'}
    />
  )
}

export function BomLinesTable({ rows, filtered }: { rows: BomLine[]; filtered: boolean }) {
  const columns: Column<BomLine>[] = [
    {
      key: 'item',
      header: 'Item',
      cell: (r) => (
        <>
          <div className="text-text-primary">
            {r.item}
            <ProductLink href={r.link} label={r.item} />
          </div>
          {r.part_number && (
            <div className="mt-0.5 font-mono text-2xs text-text-muted md:hidden">{r.part_number}</div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-text-muted md:hidden">
            <KindBadge kind={kindOf(r)} />
            {[r.vendor, r.season, r.subsystem].filter(Boolean).join(' · ')}
          </div>
          {r.notes && <div className="mt-0.5 text-2xs text-text-muted">{r.notes}</div>}
          {r.review_flag && <ReviewNote text={r.review_flag} />}
        </>
      ),
    },
    { key: 'pn', header: 'Part #', hideBelow: 'md', cell: (r) => <PartNumber value={r.part_number} /> },
    {
      key: 'where',
      header: 'Subsystem',
      hideBelow: 'lg',
      cell: (r) => (
        <>
          <span className="text-text-secondary">{r.subsystem}</span>
          {r.sub_assembly && <div className="text-2xs text-text-muted">{r.sub_assembly}</div>}
        </>
      ),
    },
    {
      key: 'season',
      header: 'Season',
      hideBelow: 'md',
      cell: (r) => (
        <>
          <span className="text-text-secondary">{r.season}</span>
          {r.ordered_on && <div className="text-2xs text-text-muted">{formatOrderDate(r.ordered_on)}</div>}
        </>
      ),
    },
    { key: 'vendor', header: 'Vendor', hideBelow: 'md', cell: (r) => (r.vendor ? <span className="text-text-secondary">{r.vendor}</span> : DASH) },
    { key: 'qty', header: 'Qty', align: 'right', hideBelow: 'sm', cell: (r) => (r.quantity === null ? DASH : r.quantity) },
    { key: 'unit', header: 'Unit', align: 'right', hideBelow: 'lg', cell: (r) => (r.unit_cost === null ? DASH : formatUsd(r.unit_cost)) },
    { key: 'total', header: 'Total', align: 'right', cell: (r) => (r.total_cost === null ? DASH : formatUsd(r.total_cost)) },
    { key: 'type', header: 'Type', hideBelow: 'lg', cell: (r) => <KindBadge kind={kindOf(r)} /> },
  ]
  return <DataTable countLabel="lines" caption="BOM lines" columns={columns} rows={rows} rowKey={(r) => r.id} emptyState={<Empty filtered={filtered} />} />
}

export function BomPartsTable({ rows, filtered }: { rows: BomPart[]; filtered: boolean }) {
  const columns: Column<BomPart>[] = [
    {
      key: 'item',
      header: 'Part',
      cell: (r) => (
        <>
          <div className="text-text-primary">
            {r.item}
            <ProductLink href={r.link} label={r.item} />
          </div>
          {r.part_number && <div className="mt-0.5 font-mono text-2xs text-text-muted md:hidden">{r.part_number}</div>}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-text-muted md:hidden">
            {r.kinds.map((k) => (
              <KindBadge key={k} kind={k} />
            ))}
            {[r.vendors.join(', '), r.seasons.join(', ')].filter(Boolean).join(' · ')}
          </div>
          {r.flagged && (
            <div className="mt-1 flex items-center gap-1 text-2xs text-status-warning">
              <AlertTriangle size={11} aria-hidden="true" /> Some lines need checking
            </div>
          )}
        </>
      ),
    },
    { key: 'pn', header: 'Part #', hideBelow: 'md', cell: (r) => <PartNumber value={r.part_number} /> },
    { key: 'subsystems', header: 'Subsystem', hideBelow: 'lg', cell: (r) => <span className="text-text-secondary">{r.subsystems.join(', ')}</span> },
    { key: 'vendors', header: 'Vendor', hideBelow: 'md', cell: (r) => (r.vendors.length ? <span className="text-text-secondary">{r.vendors.join(', ')}</span> : DASH) },
    { key: 'seasons', header: 'Seasons', hideBelow: 'lg', cell: (r) => <span className="text-text-secondary">{r.seasons.join(', ')}</span> },
    { key: 'lines', header: 'Lines', align: 'right', hideBelow: 'sm', cell: (r) => r.lineCount },
    { key: 'qty', header: 'Units ordered', align: 'right', hideBelow: 'lg', cell: (r) => (r.orderedQuantity > 0 ? r.orderedQuantity : DASH) },
    { key: 'cost', header: 'Latest unit cost', align: 'right', cell: (r) => (r.latestUnitCost === null ? DASH : formatUsd(r.latestUnitCost)) },
  ]
  return <DataTable countLabel="parts" caption="BOM parts" columns={columns} rows={rows} rowKey={(r) => r.key} emptyState={<Empty filtered={filtered} />} />
}

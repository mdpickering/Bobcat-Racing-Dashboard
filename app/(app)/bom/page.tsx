import Link from 'next/link'
import { listBomLines } from '@/lib/supabase/queries/bom'
import { createClient } from '@/lib/supabase/server'
import { bomMatches, groupByPart, kindOf, seasonOptions, summarizeBom, type BomKind } from '@/lib/bom'
import { formatUsd } from '@/lib/parts'
import ErrorState from '@/components/ui/ErrorState'
import FilterBar from '@/components/ui/FilterBar'
import MetricStrip from '@/components/ui/MetricStrip'
import PageHeader from '@/components/ui/PageHeader'
import { BomLinesTable, BomPartsTable } from '@/components/bom/BomTables'

export const metadata = { title: 'BOM Lookup' }

const KINDS: BomKind[] = ['purchase', 'quote', 'plan']
const isKind = (v: string | undefined): v is BomKind => KINDS.includes(v as BomKind)

// PostgREST says "table not in the schema cache" (PGRST205) and Postgres says "undefined table" (42P01) when migration
// 0044 has not been run yet; that deserves a plain instruction, not a generic failure.
const isMissingTable = (e: unknown) => ['PGRST205', '42P01'].includes((e as { code?: string } | null)?.code ?? '')

export default async function BomLookupPage({ searchParams }: { searchParams: { [key: string]: string | undefined } }) {
  const supabase = createClient()

  let lines
  try {
    lines = await listBomLines(supabase)
  } catch (e) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="BOM Lookup" description="Every part the team has bought, quoted or planned, by season." />
        <ErrorState message={isMissingTable(e) ? 'The BOM table has not been set up yet. Run migration 0044_bom_history.sql, then supabase/data/bom_history_2022_2026.sql.' : 'Could not load the BOM.'} />
      </div>
    )
  }

  // filters (all in the URL)
  const q = searchParams.q ?? ''
  const subsystem = searchParams.subsystem ?? ''
  const season = searchParams.season ?? ''
  const vendor = searchParams.vendor ?? ''
  const kind = isKind(searchParams.kind) ? searchParams.kind : ''
  const reviewOnly = searchParams.review === '1'
  const view = searchParams.view === 'lines' ? 'lines' : 'parts'

  const filtered = lines.filter(
    (l) =>
      (!subsystem || l.subsystem === subsystem) &&
      (!season || l.season === season) &&
      (!vendor || l.vendor === vendor) &&
      (!kind || kindOf(l) === kind) &&
      (!reviewOnly || Boolean(l.review_flag)) &&
      bomMatches(l, q)
  )
  const isFiltered = Boolean(q.trim() || subsystem || season || vendor || kind || reviewOnly)
  const summary = summarizeBom(filtered)
  const parts = view === 'parts' ? groupByPart(filtered) : []

  const subsystemOptions = Array.from(new Set(lines.map((l) => l.subsystem))).sort((a, b) => a.localeCompare(b))
  const vendorOptions = Array.from(new Set(lines.map((l) => l.vendor).filter((v): v is string => Boolean(v)))).sort((a, b) => a.localeCompare(b))

  const viewHref = (v: 'parts' | 'lines') => {
    const params = new URLSearchParams()
    for (const [k, val] of Object.entries(searchParams)) if (val && k !== 'view') params.set(k, val)
    if (v === 'lines') params.set('view', 'lines')
    const qs = params.toString()
    return qs ? `/bom?${qs}` : '/bom'
  }
  const tab = (v: 'parts' | 'lines', label: string) => (
    <Link
      href={viewHref(v)}
      aria-current={view === v ? 'page' : undefined}
      className={`touch-target inline-flex items-center border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${view === v ? 'border-ws text-text-primary' : 'border-transparent text-text-muted hover:text-text-primary'}`}
    >
      {label}
    </Link>
  )

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="BOM Lookup" description="Every part the team has bought, quoted or planned since 2022-23, with where it came from and what it cost." />

      <MetricStrip
        className="mb-5"
        metrics={[
          { label: 'Lines', value: String(summary.lines), hint: isFiltered ? `of ${lines.length}` : undefined },
          { label: 'Distinct parts', value: String(summary.distinctParts) },
          { label: 'On purchase lists', value: formatUsd(summary.purchaseTotal), hint: 'Ordered, not proof of arrival' },
          { label: 'Quoted only', value: formatUsd(summary.quoteTotal), hint: 'No record it was ordered' },
          { label: 'Need checking', value: String(summary.needsReview), tone: summary.needsReview > 0 ? 'warning' : 'success' },
        ]}
      />

      <div className="mb-4">
        <FilterBar
          search={{ key: 'q', placeholder: 'Search part, part #, vendor, notes…' }}
          fields={[
            { key: 'subsystem', allLabel: 'All subsystems', className: 'sm:w-44', options: subsystemOptions.map((s) => ({ value: s, label: s })) },
            { key: 'season', allLabel: 'All seasons', className: 'sm:w-36', options: seasonOptions(lines).map((s) => ({ value: s, label: s })) },
            { key: 'vendor', allLabel: 'All vendors', className: 'sm:w-44', options: vendorOptions.map((v) => ({ value: v, label: v })) },
            { key: 'kind', allLabel: 'All types', chips: true, options: [{ value: 'purchase', label: 'Purchases' }, { value: 'quote', label: 'Quotes' }, { value: 'plan', label: 'Plans' }] },
            { key: 'review', allLabel: 'All lines', chips: true, options: [{ value: '1', label: 'Need checking' }] },
          ]}
        />
      </div>

      <nav aria-label="BOM view" className="mb-4 flex gap-1 border-b border-border">
        {tab('parts', 'By part')}
        {tab('lines', 'All lines')}
      </nav>

      {view === 'parts' ? <BomPartsTable rows={parts} filtered={isFiltered} /> : <BomLinesTable rows={filtered} filtered={isFiltered} />}

      <p className="mt-4 max-w-3xl text-2xs leading-4 text-text-muted">
        Source: Baja Master BOM 2022-23 to 2025-26, compiled from the team&rsquo;s order sheets, quotes and planning files. A purchase list shows what was put on an order; it does not prove the part arrived or is on the car. Lines marked
        &ldquo;Check&rdquo; have an open question in the source data.
      </p>
    </div>
  )
}

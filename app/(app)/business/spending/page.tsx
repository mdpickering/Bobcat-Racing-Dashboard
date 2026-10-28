import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { listBomLines } from '@/lib/supabase/queries/bom'
import { getBusinessAccess } from '@/lib/supabase/queries/business'
import { canSeeBomCosts, spendIds } from '@/lib/bom'
import { bySeason, bySubsystem, byVendor, largestPurchases, quoteSpend, seasonOrder, seasonSpan, spendLines, subsystemBySeason, summarizeSpend } from '@/lib/bomSpend'
import { formatUsd } from '@/lib/parts'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'
import DataTable, { type Column } from '@/components/ui/DataTable'
import ErrorState, { PermissionDeniedState } from '@/components/ui/ErrorState'
import FilterBar from '@/components/ui/FilterBar'
import MetricStrip from '@/components/ui/MetricStrip'
import PageHeader from '@/components/ui/PageHeader'
import Panel from '@/components/ui/Panel'
import SpendBars from '@/components/business/SpendBars'

export const metadata = { title: 'Spending' }

const isMissingTable = (e: unknown) => ['PGRST205', '42P01'].includes((e as { code?: string } | null)?.code ?? '')
const DASH = <span className="text-text-muted">—</span>

export default async function SpendingPage({ searchParams }: { searchParams: { [key: string]: string | undefined } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  if (!profileRow) return <ErrorState message="Could not load your profile." />
  const profile = profileRow as Profile

  // Money is for Business members, the CTO and admins only (the database withholds prices from anyone else, migration 0045).
  const business = await getBusinessAccess(supabase, profile)
  if (!canSeeBomCosts({ isBusinessMember: business.isMember, isCtoOrAdmin: isCtoOrAdmin(profile) })) {
    return <PermissionDeniedState message="Spending is limited to the Business team, the CTO and Admin accounts." />
  }

  let all
  try {
    all = await listBomLines(supabase, { withCosts: true })
  } catch (e) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Spending" description="Where the team's money has gone." back={{ label: 'Back to Business', href: '/business' }} />
        <ErrorState message={isMissingTable(e) ? 'The BOM tables are not set up yet. Run migrations 0044 and 0045, then the BOM data file.' : 'Could not load the spending data.'} />
      </div>
    )
  }

  const seasons = Array.from(new Set(all.map((l) => l.season))).sort(seasonOrder).reverse()
  const season = seasons.includes(searchParams.season ?? '') ? (searchParams.season as string) : ''
  // What counts as spent is worked out on the WHOLE BOM (so a quote is matched against every order sheet), then narrowed to a season.
  const counted = spendIds(all)
  const inView = season ? all.filter((l) => l.season === season) : all
  const lines = spendLines(all).filter((l) => !season || l.season === season)
  const summary = summarizeSpend(inView, counted)
  const quotes = quoteSpend(all)
  const subsystems = bySubsystem(lines)
  const vendors = byVendor(lines, 10)
  const seasonList = bySeason(lines)
  const matrix = subsystemBySeason(lines)
  const biggest = largestPurchases(lines, 10)
  const undated = seasonList.find((s) => s.key === 'Undated')
  const span = seasonSpan(all.map((l) => l.season))

  const matrixColumns: Column<(typeof matrix.rows)[number]>[] = [
    { key: 'subsystem', header: 'Subsystem', cell: (r) => <span className="font-medium text-text-primary">{r.subsystem}</span> },
    ...matrix.seasons.map((s) => ({ key: s, header: s, align: 'right' as const, hideBelow: 'sm' as const, cell: (r: (typeof matrix.rows)[number]) => (r.bySeason[s] ? formatUsd(r.bySeason[s]) : DASH) })),
    { key: 'total', header: 'Total', align: 'right', cell: (r) => formatUsd(r.total) },
  ]
  const biggestColumns: Column<(typeof biggest)[number]>[] = [
    {
      key: 'item',
      header: 'Item',
      cell: (l) => (
        <>
          <div className="text-text-primary">{l.item}</div>
          <div className="mt-0.5 text-2xs text-text-muted">{[l.part_number, l.vendor, l.season, l.subsystem].filter(Boolean).join(' · ')}</div>
        </>
      ),
    },
    { key: 'total', header: 'Total', align: 'right', cell: (l) => formatUsd(l.total) },
  ]

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Spending"
        description={`Where the team's money has gone${span ? `, ${span}` : ''}, from the Master BOM order sheets and quotes.`}
        back={{ label: 'Back to Business', href: '/business' }}
        actions={
          <Link href="/bom" className="touch-target inline-flex items-center rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary">
            Open BOM Lookup
          </Link>
        }
      />

      <MetricStrip
        className="mb-5"
        metrics={[
          { label: season ? `Spent in ${season}` : 'Spent', value: formatUsd(summary.total), hint: season ? undefined : span ?? undefined },
          { label: 'Lines bought', value: String(summary.lines), hint: summary.unpriced > 0 ? `${summary.unpriced} with no price recorded` : undefined, tone: summary.unpriced > 0 ? 'warning' : undefined },
          { label: 'Biggest subsystem', value: subsystems[0]?.key ?? '—', hint: subsystems[0] ? `${formatUsd(subsystems[0].total)} · ${Math.round(subsystems[0].share * 100)}%` : undefined },
          { label: 'Biggest vendor', value: vendors[0] && !vendors[0].key.startsWith('Other') ? vendors[0].key : '—', hint: vendors[0] ? `${formatUsd(vendors[0].total)} · ${Math.round(vendors[0].share * 100)}%` : undefined },
        ]}
      />

      <div className="mb-5">
        <FilterBar fields={[{ key: 'season', allLabel: 'All seasons', className: 'sm:w-44', options: seasons.map((s) => ({ value: s, label: s })) }]} />
      </div>

      {lines.length === 0 ? (
        <Panel className="p-6 text-center text-xs text-text-muted">No purchases recorded{season ? ` for ${season}` : ''}.</Panel>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            {!season && (
              <Panel className="p-4">
                <h2 className="mb-3 text-xs font-semibold text-text-primary">By season</h2>
                <SpendBars groups={seasonList} ariaLabel="Spending by season" />
                {undated && <p className="mt-3 text-2xs text-text-muted">&ldquo;Undated&rdquo; is spending from files that do not say which season they belong to.</p>}
              </Panel>
            )}
            <Panel className="p-4">
              <h2 className="mb-3 text-xs font-semibold text-text-primary">By subsystem</h2>
              <SpendBars groups={subsystems} ariaLabel="Spending by subsystem" />
            </Panel>
            <Panel className={`p-4 ${season ? '' : 'md:col-span-2'}`}>
              <h2 className="mb-3 text-xs font-semibold text-text-primary">By vendor</h2>
              <SpendBars groups={vendors} ariaLabel="Spending by vendor" />
            </Panel>
          </div>

          {!season && (
            <div>
              <h2 className="mb-2 text-xs font-semibold text-text-primary">Subsystem by season</h2>
              <DataTable caption="Spending by subsystem and season" columns={matrixColumns} rows={matrix.rows} rowKey={(r) => r.subsystem} density="comfortable" />
            </div>
          )}

          <div>
            <h2 className="mb-2 text-xs font-semibold text-text-primary">Largest purchases</h2>
            <DataTable caption="Largest purchase lines" columns={biggestColumns} rows={biggest} rowKey={(l) => l.id} density="comfortable" />
          </div>
        </div>
      )}

      <p className="mt-5 max-w-3xl text-2xs leading-4 text-text-muted">
        Counts the lines on order sheets and the quotes the team ordered from ({formatUsd(quotes.total)} of the total comes from {quotes.lines} quote lines). A quote that repeats a part already on an order sheet (same part number, same
        vendor) is counted once: {quotes.repeatedLines} such line{quotes.repeatedLines === 1 ? ' was' : 's were'} left out ({formatUsd(quotes.repeatedTotal)}). Planned lists are not spending. If several vendors quoted the same job and only one was ordered, change
        the others to &ldquo;Planned BOM&rdquo; on the BOM review page so they stop counting. An order sheet or quote does not prove the part arrived, and anything missing from the team&rsquo;s sheets is missing here too.
      </p>
    </div>
  )
}

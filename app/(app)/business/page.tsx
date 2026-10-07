import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getBusinessAccess } from '@/lib/supabase/queries/business'
import { getCurrentCompetitionSettings } from '@/lib/supabase/queries/competition'
import { getWorkspaceContext } from '@/lib/supabase/queries/workspaces'
import {
  getEngineeringSnapshot,
  getPurchasingOverview,
  getSponsorshipOverview,
  type EngineeringSnapshot,
  type PurchasingOverview,
  type SponsorshipOverview,
} from '@/lib/supabase/queries/businessDashboard'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import { formatMoney, seasonLabel } from '@/lib/sponsorships'
import { formatDate } from '@/lib/format'
import type { Profile } from '@/types/user'
import PageHeader from '@/components/ui/PageHeader'
import SectionHeader from '@/components/ui/SectionHeader'
import MetricStrip from '@/components/ui/MetricStrip'
import Panel from '@/components/ui/Panel'
import Badge from '@/components/ui/Badge'
import StatusBadge from '@/components/ui/StatusBadge'
import { BarList, ProgressBar } from '@/components/ui/Charts'
import ErrorState, { PermissionDeniedState } from '@/components/ui/ErrorState'
import PurchaseStatusBadge from '@/components/purchasing/PurchaseStatusBadge'

export const metadata = { title: 'Business' }

// Money figures that come from purchase items can be a floor when some items have no cost yet; say so.
function ItemsWithoutCostNote({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <p className="mt-2 text-xs text-text-muted">
      {count} approved or received item{count === 1 ? ' has' : 's have'} no cost entered yet, so the purchasing totals may be higher than shown.
    </p>
  )
}

export default async function BusinessPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  if (!profileRow) return <ErrorState message="Could not load your profile." />
  const profile = profileRow as Profile

  const access = await getBusinessAccess(supabase, profile)
  if (!access.canView) return <PermissionDeniedState message="The Business area is limited to the Business team, the COO, the CTO and Admin accounts." />

  const [competition, workspaces] = await Promise.all([
    getCurrentCompetitionSettings(supabase).catch(() => null),
    getWorkspaceContext(supabase, profile),
  ])

  // Each section loads on its own, so one failing query never blanks the whole dashboard.
  const [sponsorship, purchasing, engineering]: [SponsorshipOverview | null, PurchasingOverview | null, EngineeringSnapshot | null] = await Promise.all([
    competition ? getSponsorshipOverview(supabase, competition.season).catch(() => null) : Promise.resolve(null),
    getPurchasingOverview(supabase).catch(() => null),
    getEngineeringSnapshot(supabase).catch(() => null),
  ])

  const canOpenEngineering = workspaces.available.includes('engineering')
  const season = competition?.season ?? null
  const seasonQuery = season ? `?season=${encodeURIComponent(season)}` : ''

  const roleBadges = (
    <>
      {access.isLead && <Badge tone="gold">Business Lead</Badge>}
      {access.responsibilities.includes('sponsorship_lead') && <Badge tone="info">Sponsorship Lead</Badge>}
      {access.isMember && !access.isLead && <Badge tone="neutral">Business Member</Badge>}
      {!access.isMember && isCtoOrAdmin(profile) && <Badge tone="gold">Full access ({profile.role})</Badge>}
      {!access.isMember && !isCtoOrAdmin(profile) && <Badge tone="warning">Read-only</Badge>}
    </>
  )

  const noSponsorships = sponsorship !== null && sponsorship.rows.length === 0

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Business" description="How the team is doing financially and operationally." actions={roleBadges} />

      <div className="space-y-10">
        {/* ---------------- Financial health ---------------- */}
        <section aria-label="Financial health">
          <SectionHeader
            title="Financial health"
            description={
              sponsorship
                ? `Sponsorships for ${seasonLabel(sponsorship.season)} (committed sponsors only); purchasing across every team.`
                : 'Sponsorships for the current season; purchasing across every team.'
            }
          />
          <MetricStrip
            metrics={[
              {
                label: 'Sponsorship value',
                value: sponsorship ? formatMoney(sponsorship.totalValue) : '—',
                hint: sponsorship ? (noSponsorships ? 'None recorded yet' : `${formatMoney(sponsorship.cashCommitted)} cash + ${formatMoney(sponsorship.inKindValue)} in-kind`) : 'Unavailable',
                href: `/business/sponsorships${seasonQuery}`,
              },
              { label: 'Cash received', value: sponsorship ? formatMoney(sponsorship.cashReceived) : '—', tone: sponsorship && sponsorship.cashReceived > 0 ? 'success' : undefined },
              {
                label: 'Cash outstanding',
                value: sponsorship ? formatMoney(sponsorship.cashOutstanding) : '—',
                tone: sponsorship && sponsorship.cashOutstanding > 0 ? 'warning' : undefined,
                hint: 'Committed, not yet received',
              },
              { label: 'Committed spending', value: purchasing ? formatMoney(purchasing.committedTotal) : '—', hint: 'Approved, ordered or in transit', href: '/purchasing' },
              { label: 'Spent', value: purchasing ? formatMoney(purchasing.spentTotal) : '—', hint: 'Received in the shop', href: '/purchasing' },
            ]}
          />
          {purchasing && <ItemsWithoutCostNote count={purchasing.itemsWithoutCost} />}
          <p className="mt-3 text-xs text-text-muted">Total budget and remaining funds appear here once Budget is built. Until then nothing is estimated.</p>
        </section>

        {/* ---------------- Sponsorships + Purchasing ---------------- */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <section aria-label="Sponsorships">
            <SectionHeader
              title="Sponsorships"
              description={sponsorship ? seasonLabel(sponsorship.season) : undefined}
              actions={
                <Link href={`/business/sponsorships${seasonQuery}`} className="text-xs text-accent-blue hover:underline">
                  Open sponsorships
                </Link>
              }
            />
            <Panel className="space-y-5 p-5">
              {sponsorship === null ? (
                <p className="text-xs text-text-secondary">{competition ? 'Could not load sponsorships.' : 'No season is configured yet. An admin creates it in Administration → Competition.'}</p>
              ) : noSponsorships ? (
                <p className="text-xs text-text-secondary">
                  No sponsorships are recorded for {seasonLabel(sponsorship.season)} yet.{' '}
                  {sponsorship.levels.length === 0 ? 'The season also has no sponsorship program set up. ' : ''}
                  <Link href={`/business/sponsorships${seasonQuery}`} className="text-accent-blue hover:underline">
                    Go to Sponsorships
                  </Link>
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-2xs font-medium text-text-muted">Committed sponsors</div>
                      <div className="mt-1 text-2xl font-semibold tabular-nums leading-8 text-text-primary">{sponsorship.committed.length}</div>
                      {sponsorship.rows.length > sponsorship.committed.length && <div className="text-xs text-text-muted">{sponsorship.rows.length - sponsorship.committed.length} more in progress</div>}
                    </div>
                    <div>
                      <div className="text-2xs font-medium text-text-muted">In-kind value</div>
                      <div className="mt-1 text-2xl font-semibold tabular-nums leading-8 text-text-primary">{formatMoney(sponsorship.inKindValue)}</div>
                      <div className="text-xs text-text-muted">Estimated, not cash</div>
                    </div>
                  </div>
                  {sponsorship.cashCommitted > 0 && (
                    <ProgressBar label="Cash received" value={sponsorship.cashReceived} total={sponsorship.cashCommitted} valueLabel={`${formatMoney(sponsorship.cashReceived)} of ${formatMoney(sponsorship.cashCommitted)}`} />
                  )}
                  {sponsorship.byLevel.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-xs font-medium text-text-secondary">Committed sponsors by level</h3>
                      <BarList ariaLabel="Committed sponsors by level" items={sponsorship.byLevel.map((l) => ({ label: l.name, value: l.count }))} />
                      {sponsorship.unassigned > 0 && <p className="mt-2 text-xs text-text-muted">{sponsorship.unassigned} committed without a level (historical or custom).</p>}
                    </div>
                  )}
                  {sponsorship.needsReview > 0 && (
                    <Link
                      href={`/business/sponsorships?season=${encodeURIComponent(sponsorship.season)}&review=needs_review`}
                      className="touch-target flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs transition-colors hover:bg-surface-raised"
                    >
                      <span className="text-text-secondary">
                        <strong className="text-text-primary">{sponsorship.needsReview}</strong> sponsorship{sponsorship.needsReview === 1 ? '' : 's'} need a level review
                      </span>
                      <StatusBadge tone="warning">Review</StatusBadge>
                    </Link>
                  )}
                </>
              )}
            </Panel>
          </section>

          <section aria-label="Purchasing">
            <SectionHeader
              title="Purchasing"
              actions={
                <Link href="/purchasing" className="text-xs text-accent-blue hover:underline">
                  Open purchasing
                </Link>
              }
            />
            <Panel className="space-y-5 p-5">
              {purchasing === null ? (
                <p className="text-xs text-text-secondary">Could not load purchasing.</p>
              ) : purchasing.total === 0 ? (
                <p className="text-xs text-text-secondary">
                  No purchase requests yet. Team leads create them from{' '}
                  <Link href="/purchasing" className="text-accent-blue hover:underline">
                    Purchasing
                  </Link>
                  .
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                    {[
                      { label: 'Awaiting approval', value: purchasing.awaitingApproval, tone: purchasing.awaitingApproval > 0 ? 'warning' : undefined, href: '/purchasing?status=Submitted' },
                      { label: 'Approved, to order', value: purchasing.approved, tone: undefined, href: '/purchasing?status=Approved' },
                      { label: 'Ordered, awaiting receipt', value: purchasing.awaitingReceipt, tone: undefined, href: '/purchasing?status=Ordered' },
                      { label: 'Received', value: purchasing.received, tone: purchasing.received > 0 ? 'success' : undefined, href: '/purchasing?status=Arrived%20in%20Shop' },
                    ].map((m) => (
                      <Link key={m.label} href={m.href} className="touch-target block rounded-md transition-colors hover:text-accent-blue">
                        <div className={`text-2xl font-semibold tabular-nums leading-8 ${m.tone === 'warning' ? 'text-status-warning' : m.tone === 'success' ? 'text-status-success' : 'text-text-primary'}`}>{m.value}</div>
                        <div className="text-xs text-text-muted">{m.label}</div>
                      </Link>
                    ))}
                  </div>
                  <div>
                    <h3 className="mb-2 text-xs font-medium text-text-secondary">Latest requests</h3>
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {purchasing.recent.map((r) => (
                        <li key={r.id}>
                          <Link href={`/purchasing/${r.id}`} className="flex items-center justify-between gap-3 px-3 py-2 text-xs transition-colors hover:bg-surface-raised">
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-text-primary">{r.title || 'Untitled request'}</span>
                              <span className="block truncate text-text-muted">
                                {r.subsystem?.name ?? 'Unknown'} · {formatDate(r.created_at)}
                              </span>
                            </span>
                            <PurchaseStatusBadge status={r.status} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </Panel>
          </section>
        </div>

        {/* ---------------- Engineering snapshot ---------------- */}
        {engineering && (
          <section aria-label="Engineering snapshot">
            <SectionHeader
              title="Engineering snapshot"
              description="Open work across the team, as far as your access shows it."
              actions={
                canOpenEngineering ? (
                  <Link href="/dashboard" className="text-xs text-accent-blue hover:underline">
                    View Engineering
                  </Link>
                ) : undefined
              }
            />
            <Panel className="p-5">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-2xl font-semibold tabular-nums leading-8 text-text-primary">{engineering.open}</div>
                  <div className="text-xs text-text-muted">Open tasks</div>
                </div>
                <div>
                  <div className={`text-2xl font-semibold tabular-nums leading-8 ${engineering.overdue > 0 ? 'text-status-danger' : 'text-text-primary'}`}>{engineering.overdue}</div>
                  <div className="text-xs text-text-muted">Overdue</div>
                </div>
                <div>
                  <div className={`text-2xl font-semibold tabular-nums leading-8 ${engineering.dueSoon > 0 ? 'text-status-warning' : 'text-text-primary'}`}>{engineering.dueSoon}</div>
                  <div className="text-xs text-text-muted">Due in 7 days</div>
                </div>
              </div>
            </Panel>
          </section>
        )}
      </div>
    </div>
  )
}

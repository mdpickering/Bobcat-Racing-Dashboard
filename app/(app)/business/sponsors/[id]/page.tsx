import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getSponsorHistory, getSponsorshipAccess } from '@/lib/supabase/queries/sponsorships'
import { IN_KIND_TYPE_LABEL, SPONSOR_TYPE_LABEL, formatContributionDate, formatMoney, seasonLabel } from '@/lib/sponsorships'
import type { Profile } from '@/types/user'
import Panel from '@/components/ui/Panel'
import Badge from '@/components/ui/Badge'
import ErrorState, { PermissionDeniedState } from '@/components/ui/ErrorState'
import ContactsPanel from '@/components/sponsorships/ContactsPanel'
import { LevelBadge, ReviewBadge, StageBadge } from '@/components/sponsorships/SponsorshipBadges'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Everything one sponsor has ever done with the team, season by season.
export default async function SponsorHistoryPage({ params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) notFound()

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  if (!profileRow) return <ErrorState message="Could not load your profile." />
  const profile = profileRow as Profile

  const access = await getSponsorshipAccess(supabase, profile)
  if (!access.canView) return <PermissionDeniedState message="The Business area is limited to the Business team, the COO, the CTO and Admin accounts." />

  let history
  try {
    history = await getSponsorHistory(supabase, params.id)
  } catch {
    return <ErrorState message="Could not load this sponsor." />
  }
  if (!history) notFound()
  const { sponsor, contacts, seasons } = history

  const lifetimeCash = seasons.reduce((a, s) => a + s.summary.cash_committed, 0)
  const lifetimeInKind = seasons.reduce((a, s) => a + s.summary.in_kind_value, 0)

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Panel className="p-5">
        <Link href="/business/sponsorships" className="mb-3 flex items-center gap-1 text-[12px] text-text-muted hover:text-accent-blue">
          <ChevronLeft size={13} /> Back to sponsorships
        </Link>
        <h1 className="text-base font-bold text-text-primary">{sponsor.name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-text-muted">
          <span>{SPONSOR_TYPE_LABEL[sponsor.sponsor_type]}</span>
          {!sponsor.active && <Badge tone="slate">Archived</Badge>}
          {sponsor.website && (
            <a href={sponsor.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-accent-blue">
              · {sponsor.website.replace(/^https?:\/\//, '')} <ExternalLink size={10} />
            </a>
          )}
        </div>
        {sponsor.notes && <p className="mt-3 whitespace-pre-wrap text-xs text-text-secondary">{sponsor.notes}</p>}
        {seasons.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-xs">
            <div>
              <div className="font-mono text-[11px] uppercase text-text-muted">Seasons</div>
              <div className="mt-1 text-base font-bold text-text-primary">{seasons.length}</div>
            </div>
            <div>
              <div className="font-mono text-[11px] uppercase text-text-muted">Cash committed, all seasons</div>
              <div className="mt-1 text-base font-bold text-text-primary">{formatMoney(lifetimeCash)}</div>
            </div>
            <div>
              <div className="font-mono text-[11px] uppercase text-text-muted">In-kind, all seasons</div>
              <div className="mt-1 text-base font-bold text-text-primary">{formatMoney(lifetimeInKind)}</div>
            </div>
          </div>
        )}
      </Panel>

      {seasons.length === 0 ? (
        <Panel className="p-4">
          <p className="text-[12px] text-text-muted">This sponsor has no sponsorships yet.</p>
        </Panel>
      ) : (
        seasons.map(({ sponsorship, summary, review, contributions }) => (
          <Panel key={sponsorship.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/business/sponsorships/${sponsorship.id}`} className="text-sm font-bold text-text-primary hover:text-accent-blue">
                {seasonLabel(sponsorship.season)}
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <StageBadge stage={sponsorship.stage} />
                <LevelBadge name={summary.level_name} />
                <ReviewBadge flag={review?.review_flag} quietWhenOk />
              </div>
            </div>
            <div className="mt-2 text-[12px] text-text-secondary">
              Cash {formatMoney(summary.cash_committed)} committed · {formatMoney(summary.cash_received)} received
              {summary.cash_outstanding > 0 && <span className="text-amber-400"> · {formatMoney(summary.cash_outstanding)} outstanding</span>}
              {' '}· In-kind {formatMoney(summary.in_kind_value)}
            </div>
            {contributions.length > 0 && (
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border text-xs">
                {contributions.map((c) => (
                  <li key={c.id} className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 ${c.withdrawn ? 'opacity-60' : ''}`}>
                    <span>
                      <span className={`font-semibold tabular-nums text-text-primary ${c.withdrawn ? 'line-through' : ''}`}>{formatMoney(c.kind === 'cash' ? c.committed_amount : c.estimated_value)}</span>
                      <span className="ml-2 text-text-secondary">{c.kind === 'cash' ? 'Cash' : `In-kind${c.in_kind_type ? ` · ${IN_KIND_TYPE_LABEL[c.in_kind_type]}` : ''}`}</span>
                      {c.withdrawn && <span className="ml-2 text-rose-400">withdrawn</span>}
                    </span>
                    <span className="text-[11px] text-text-muted">{formatContributionDate(c.contributed_on, c.contributed_on_precision)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
              {sponsorship.agreement_url && (
                <a href={sponsorship.agreement_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-blue hover:underline">
                  Agreement <ExternalLink size={10} />
                </a>
              )}
              {sponsorship.notes && <span className="text-text-muted">{sponsorship.notes}</span>}
            </div>
          </Panel>
        ))
      )}

      <ContactsPanel sponsorId={sponsor.id} contacts={contacts} canManage={access.canManage} />
    </div>
  )
}

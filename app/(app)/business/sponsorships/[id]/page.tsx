import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSponsorshipAccess, getSponsorshipDetail, listSeasons } from '@/lib/supabase/queries/sponsorships'
import { listBusinessMembers } from '@/lib/supabase/queries/business'
import type { Profile } from '@/types/user'
import ErrorState, { PermissionDeniedState } from '@/components/ui/ErrorState'
import SponsorshipHeader from '@/components/sponsorships/SponsorshipHeader'
import QualificationPanel from '@/components/sponsorships/QualificationPanel'
import ContributionsPanel from '@/components/sponsorships/ContributionsPanel'
import PaymentsPanel from '@/components/sponsorships/PaymentsPanel'
import LevelDecisionsPanel from '@/components/sponsorships/LevelDecisionsPanel'
import DeliverablesPanel from '@/components/sponsorships/DeliverablesPanel'
import ContactsPanel from '@/components/sponsorships/ContactsPanel'
import RenewalPanel from '@/components/sponsorships/RenewalPanel'
import HistoryPanel from '@/components/sponsorships/HistoryPanel'

export const metadata = { title: 'Sponsorship' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function SponsorshipDetailPage({ params }: { params: { id: string } }) {
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

  let detail
  try {
    detail = await getSponsorshipDetail(supabase, params.id)
  } catch {
    return <ErrorState message="Could not load this sponsorship." />
  }
  if (!detail) notFound()

  const [seasons, members] = await Promise.all([
    listSeasons(supabase).catch(() => []),
    access.canManage ? listBusinessMembers(supabase).catch(() => []) : Promise.resolve([]),
  ])
  const eventName = seasons.find((s) => s.season === detail.sponsorship.season)?.competition_name ?? null
  const businessMembers = members.map((m) => ({ user_id: m.user_id, name: m.profile?.display_name || m.profile?.email || 'Unknown' }))

  const { sponsorship, summary, review, contacts, contributions, payments, decisions, deliverables, renewal, reminders, history, levels } = detail
  const currentDecision = decisions.find((d) => d.id === sponsorship.level_decision_id) ?? null
  const currentLevel = levels.find((l) => l.id === sponsorship.level_id) ?? null

  return (
    <div className="mx-auto max-w-6xl">
      <SponsorshipHeader sponsorship={sponsorship} eventName={eventName} businessMembers={businessMembers} canManage={access.canManage} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        {/* the summary rail comes first on phones and sits to the right (sticky) on desktop */}
        <aside className="space-y-4 lg:col-start-2 lg:row-start-1 lg:sticky lg:top-0 lg:self-start">
          <QualificationPanel
            sponsorshipId={sponsorship.id}
            summary={summary}
            review={review}
            levels={levels}
            currentDecision={currentDecision}
            customTerms={sponsorship.custom_terms}
            canManage={access.canManage}
          />
          <RenewalPanel
            sponsorshipId={sponsorship.id}
            renewalDate={sponsorship.renewal_date}
            responsibleName={sponsorship.responsible?.display_name || sponsorship.responsible?.email || null}
            status={renewal}
            reminders={reminders}
            canManage={access.canManage}
          />
          <ContactsPanel sponsorId={sponsorship.sponsor_id} contacts={contacts} canManage={access.canManage} />
        </aside>
        <div className="space-y-4 lg:col-start-1 lg:row-start-1">
          <ContributionsPanel sponsorshipId={sponsorship.id} contributions={contributions} canManage={access.canManage} />
          <PaymentsPanel contributions={contributions} payments={payments} canManage={access.canManage} />
          <LevelDecisionsPanel decisions={decisions} currentDecisionId={sponsorship.level_decision_id} />
          <DeliverablesPanel
            sponsorshipId={sponsorship.id}
            level={currentLevel}
            decisionMethod={currentDecision?.method ?? null}
            deliverables={deliverables}
            canManage={access.canManage}
            currentUserId={profile.id}
            businessMembers={businessMembers}
          />
          <HistoryPanel sponsorshipId={sponsorship.id} history={history} canManage={access.canManage} />
        </div>
      </div>
    </div>
  )
}
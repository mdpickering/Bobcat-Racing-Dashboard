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
import HistoryPanel from '@/components/sponsorships/HistoryPanel'

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

  const { sponsorship, summary, review, contacts, contributions, payments, decisions, history, levels } = detail
  const currentDecision = decisions.find((d) => d.id === sponsorship.level_decision_id) ?? null
  const currentLevel = levels.find((l) => l.id === sponsorship.level_id) ?? null

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <SponsorshipHeader sponsorship={sponsorship} eventName={eventName} businessMembers={businessMembers} canManage={access.canManage} />
      <QualificationPanel
        sponsorshipId={sponsorship.id}
        summary={summary}
        review={review}
        levels={levels}
        currentDecision={currentDecision}
        customTerms={sponsorship.custom_terms}
        canManage={access.canManage}
      />
      <ContributionsPanel sponsorshipId={sponsorship.id} contributions={contributions} canManage={access.canManage} />
      <PaymentsPanel contributions={contributions} payments={payments} canManage={access.canManage} />
      <LevelDecisionsPanel decisions={decisions} currentDecisionId={sponsorship.level_decision_id} />
      <DeliverablesPanel level={currentLevel} />
      <ContactsPanel sponsorId={sponsorship.sponsor_id} contacts={contacts} canManage={access.canManage} />
      <HistoryPanel sponsorshipId={sponsorship.id} history={history} canManage={access.canManage} />
    </div>
  )
}

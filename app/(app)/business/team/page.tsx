import PageHeader from '@/components/ui/PageHeader'
import MetricStrip from '@/components/ui/MetricStrip'
import { createClient } from '@/lib/supabase/server'
import { getBusinessAccess, listBusinessCandidates, listBusinessMembers } from '@/lib/supabase/queries/business'
import type { Profile } from '@/types/user'
import ErrorState, { PermissionDeniedState } from '@/components/ui/ErrorState'
import BusinessTeamPanel from '@/components/business/BusinessTeamPanel'

export const metadata = { title: 'Business team' }

export default async function BusinessTeamPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  if (!profileRow) return <ErrorState message="Could not load your profile." />
  const profile = profileRow as Profile

  const access = await getBusinessAccess(supabase, profile)
  if (!access.canView) return <PermissionDeniedState message="The Business area is limited to the Business team, the COO, the CTO and Admin accounts." />

  let members
  try {
    members = await listBusinessMembers(supabase)
  } catch {
    return <ErrorState message="Could not load the Business team." />
  }
  const candidates = access.canManageTeam ? await listBusinessCandidates(supabase, members.map((m) => m.user_id)).catch(() => []) : []

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Business team" description="The people who run the business side of the team, and who leads it." back={{ label: 'Back to Business', href: '/business' }} />
      <MetricStrip
        className="mb-6"
        metrics={[
          { label: 'Members', value: String(members.length) },
          { label: 'Business Leads', value: String(members.filter((m) => m.is_lead).length) },
          { label: 'Sponsorship Leads', value: String(members.filter((m) => (m.responsibilities ?? []).some((r) => r.responsibility === 'sponsorship_lead')).length) },
        ]}
      />
      <BusinessTeamPanel
        members={members}
        candidates={candidates}
        currentUserId={profile.id}
        canManageTeam={access.canManageTeam}
        canManageLeads={access.canManageLeads}
      />
    </div>
  )
}

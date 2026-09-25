import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getBusinessAccess, listBusinessCandidates, listBusinessMembers } from '@/lib/supabase/queries/business'
import type { Profile } from '@/types/user'
import ErrorState, { PermissionDeniedState } from '@/components/ui/ErrorState'
import BusinessTeamPanel from '@/components/business/BusinessTeamPanel'

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
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/business" className="flex items-center gap-1 text-[11px] text-text-muted hover:text-accent-blue">
        <ChevronLeft size={13} /> Back to Business
      </Link>
      <div>
        <h1 className="text-lg font-bold text-text-primary">Business team</h1>
        <p className="mt-0.5 text-xs font-mono text-text-muted">The people who run the business side of the team, and who leads it.</p>
      </div>
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

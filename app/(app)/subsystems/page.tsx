import { createClient } from '@/lib/supabase/server'
import { listSubsystems, listAllSubsystems } from '@/lib/supabase/queries/subsystems'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'
import SubsystemsPageClient from '@/components/subsystems/SubsystemsPageClient'
import ErrorState from '@/components/ui/ErrorState'

export default async function SubsystemsPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  const profile = profileRow as Profile
  const admin = isCtoOrAdmin(profile)

  let subsystems
  try {
    subsystems = admin ? await listAllSubsystems(supabase) : await listSubsystems(supabase)
  } catch {
    return <ErrorState message="Could not load subsystems." />
  }

  return <SubsystemsPageClient subsystems={subsystems} canCreate={admin} />
}

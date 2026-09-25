import { createClient } from '@/lib/supabase/server'
import { getBusinessAccess } from '@/lib/supabase/queries/business'
import { PermissionDeniedState } from '@/components/ui/ErrorState'
import type { Profile } from '@/types/user'

// Defence in depth for the whole /business area: the same rule the pages and Row Level Security already apply
// (Business team members, the COO read-only, cto/admin). This can only ever deny what is already denied.
export default async function BusinessLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = user ? await supabase.from('profiles').select('*').eq('id', user.id).single() : { data: null }
  const access = profile ? await getBusinessAccess(supabase, profile as Profile) : null
  if (!access?.canView) {
    return <PermissionDeniedState message="The Business area is limited to the Business team, the COO, the CTO and Admin accounts." />
  }
  return <>{children}</>
}

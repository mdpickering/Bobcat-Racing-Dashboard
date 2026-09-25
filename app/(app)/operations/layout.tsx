import { createClient } from '@/lib/supabase/server'
import { canManageOperations } from '@/lib/permissions/roles'
import { PermissionDeniedState } from '@/components/ui/ErrorState'
import type { Profile } from '@/types/user'

// Defence in depth for the whole /operations area: the same rule the pages and Row Level Security (migration 0028)
// already apply (COO, CTO, admin). This can only ever deny what is already denied.
export default async function OperationsLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = user ? await supabase.from('profiles').select('*').eq('id', user.id).single() : { data: null }
  if (!profile || !canManageOperations(profile as Profile)) {
    return <PermissionDeniedState message="Operations is limited to the COO, CTO and Admin accounts." />
  }
  return <>{children}</>
}

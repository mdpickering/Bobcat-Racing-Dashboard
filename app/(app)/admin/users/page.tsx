import { createClient } from '@/lib/supabase/server'
import { listAllProfiles } from '@/lib/supabase/queries/admin'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'
import { PermissionDeniedState } from '@/components/ui/ErrorState'
import ErrorState from '@/components/ui/ErrorState'
import AdminNav from '@/components/admin/AdminNav'
import UserFilters from '@/components/admin/UserFilters'
import UserList from '@/components/admin/UserList'

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined }
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()

  if (!profile) return <ErrorState message="Could not load your profile." />
  const p = profile as Profile
  if (!isCtoOrAdmin(p)) return <PermissionDeniedState message="User management is limited to CTO and Admin accounts." />

  let users
  try {
    users = await listAllProfiles(supabase, {
      search: searchParams.search,
      role: searchParams.role,
      approved: searchParams.approved as 'true' | 'false' | undefined,
      active: searchParams.active as 'true' | 'false' | undefined,
    })
  } catch {
    return <ErrorState message="Could not load users." />
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Users</h1>
        <p className="mt-0.5 text-xs font-mono text-text-muted">
          {users.length} user{users.length === 1 ? '' : 's'} matching your filters
        </p>
      </div>
      <AdminNav />
      <UserFilters />
      <UserList users={users} />
    </div>
  )
}

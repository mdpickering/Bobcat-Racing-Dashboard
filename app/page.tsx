import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceContext } from '@/lib/supabase/queries/workspaces'
import { WORKSPACES } from '@/lib/workspaces'
import { WORKSPACE_COOKIE } from '@/lib/workspaceAccess'
import type { Profile } from '@/types/user'

// The front door. Signed-in people land in their workspace: the one they used last (if they may still use it),
// otherwise the default for their role. Signed-out people go to log in.
export default async function RootPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile?.approved) redirect('/pending-approval')
  if (!profile.active) redirect('/deactivated')

  const { start } = await getWorkspaceContext(supabase, profile as Profile, cookies().get(WORKSPACE_COOKIE)?.value)
  redirect(WORKSPACES[start].home)
}

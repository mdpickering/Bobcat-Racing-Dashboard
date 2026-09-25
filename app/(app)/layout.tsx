import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'
import { getWorkspaceContext } from '@/lib/supabase/queries/workspaces'
import { WORKSPACE_COOKIE } from '@/lib/workspaceAccess'
import type { Profile } from '@/types/user'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile?.approved) redirect('/pending-approval')
  if (!profile.active) redirect('/deactivated')

  // Which workspaces to offer. This is navigation only: every page still checks its own access and Row Level
  // Security is the real boundary, so nothing here grants or removes access to any data.
  const workspaces = await getWorkspaceContext(supabase, profile as Profile, cookies().get(WORKSPACE_COOKIE)?.value)

  return (
    <AppShell profile={profile as Profile} available={workspaces.available} startWorkspace={workspaces.start}>
      {children}
    </AppShell>
  )
}

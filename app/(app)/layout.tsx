import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'
import { getBusinessAccess } from '@/lib/supabase/queries/business'
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

  // Business area visibility (the database enforces the real access; this only decides whether to show the link).
  const business = await getBusinessAccess(supabase, profile as Profile)

  return (
    <AppShell profile={profile as Profile} canViewBusiness={business.canView}>
      {children}
    </AppShell>
  )
}

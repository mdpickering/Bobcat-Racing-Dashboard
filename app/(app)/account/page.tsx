import { createClient } from '@/lib/supabase/server'
import AccountForm from '@/components/account/AccountForm'
import ErrorState from '@/components/ui/ErrorState'
import type { Profile } from '@/types/user'

export default async function AccountPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()

  if (!profile) return <ErrorState message="Could not load your account." />

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Account</h1>
        <p className="mt-0.5 text-xs font-mono text-text-muted">Your profile, preferences, and session.</p>
      </div>
      <AccountForm profile={profile as Profile} />
    </div>
  )
}

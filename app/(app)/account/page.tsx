import { createClient } from '@/lib/supabase/server'
import AccountForm from '@/components/account/AccountForm'
import EmailNotificationsPanel from '@/components/account/EmailNotificationsPanel'
import ErrorState from '@/components/ui/ErrorState'
import { listEmailPreferences } from '@/lib/supabase/queries/emailPreferences'
import type { EmailPreferenceCategory } from '@/types/database'
import type { Profile } from '@/types/user'

export default async function AccountPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()

  if (!profile) return <ErrorState message="Could not load your account." />

  // A problem loading the email settings must never take the rest of the account page down.
  let categories: EmailPreferenceCategory[] = []
  let loadError: string | null = null
  try {
    categories = await listEmailPreferences(supabase)
  } catch {
    loadError = 'Could not load your email notification settings right now.'
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Account</h1>
        <p className="mt-0.5 text-xs font-mono text-text-muted">Your profile, preferences, and session.</p>
      </div>
      <AccountForm
        profile={profile as Profile}
        emailSection={<EmailNotificationsPanel categories={categories} email={(profile as Profile).email} loadError={loadError} />}
      />
    </div>
  )
}

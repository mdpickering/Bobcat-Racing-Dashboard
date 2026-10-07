'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import Panel from '@/components/ui/Panel'

export default function DeactivatedPage() {
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <Panel className="w-full max-w-sm p-6 text-xs text-text-secondary space-y-4">
        <h1 className="text-sm font-bold text-text-primary">
          Account Deactivated
        </h1>
        <p>
          Your account has been deactivated by a team admin, so you can no
          longer access the dashboard. If you think this is a mistake, contact
          your CTO or a team admin.
        </p>
        <Button variant="secondary" onClick={handleLogout}>
          Log Out
        </Button>
      </Panel>
    </div>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import Panel from '@/components/ui/Panel'

export default function PendingApprovalPage() {
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-qu-obsidian px-4">
      <Panel className="w-full max-w-sm p-6 text-xs text-slate-300 space-y-4">
        <h1 className="text-sm font-bold text-slate-100">
          Application Pending
        </h1>
        <p>
          Your account has been created and is waiting for a team admin to
          approve it. You&apos;ll be able to access the dashboard once
          you&apos;re approved.
        </p>
        <Button variant="secondary" onClick={handleLogout}>
          Log Out
        </Button>
      </Panel>
    </div>
  )
}

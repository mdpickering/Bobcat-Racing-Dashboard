'use client'

import { useRouter } from 'next/navigation'
import { ShieldOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import AuthShell from '@/components/auth/AuthShell'

export default function DeactivatedPage() {
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <AuthShell
      title="Account deactivated"
      icon={<ShieldOff size={20} aria-hidden="true" />}
      description="Your account has been deactivated by a team admin, so you can no longer access the dashboard. If you think this is a mistake, contact your CTO or a team admin."
    >
      <Button variant="secondary" onClick={handleLogout} className="rounded-xl">
        Log out
      </Button>
    </AuthShell>
  )
}

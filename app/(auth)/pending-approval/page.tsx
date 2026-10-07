'use client'

import { useRouter } from 'next/navigation'
import { Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import AuthShell from '@/components/auth/AuthShell'

export default function PendingApprovalPage() {
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <AuthShell
      title="Application pending"
      icon={<Clock size={20} aria-hidden="true" />}
      description="Your account has been created and is waiting for a team admin to approve it. You'll be able to open the dashboard once you're approved."
    >
      <Button variant="secondary" onClick={handleLogout} className="rounded-xl">
        Log out
      </Button>
    </AuthShell>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import type { Profile } from '@/types/user'

interface HeaderProps {
  profile: Profile
}

export default function Header({ profile }: HeaderProps) {
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="h-16 px-6 flex items-center justify-between bg-qu-navy/40 border-b border-white/10">
      <span className="text-xs font-mono text-slate-400">
        Welcome back, {profile.display_name || profile.email}
      </span>
      <Button variant="secondary" onClick={handleLogout}>
        Log Out
      </Button>
    </header>
  )
}

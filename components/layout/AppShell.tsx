'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import type { Profile } from '@/types/user'
import Sidebar from './Sidebar'
import Header from './Header'

export default function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-text-primary">
      <div className="hidden md:block">
        <Sidebar profile={profile} />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative flex h-full">
            <Sidebar profile={profile} onNavigate={() => setMobileOpen(false)} />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
              className="absolute right-[-44px] top-4 flex h-8 w-8 items-center justify-center rounded-lg bg-surface-raised text-text-secondary"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Header profile={profile} onOpenMobileNav={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto scrollbar-thin p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}

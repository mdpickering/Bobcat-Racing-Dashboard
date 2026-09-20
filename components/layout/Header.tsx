'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Menu, Search, X, LogOut, ChevronDown, UserCog } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types/user'
import Avatar from '@/components/ui/Avatar'
import ThemeToggle from '@/components/theme/ThemeToggle'
import NotificationBell from '@/components/notifications/NotificationBell'
import SearchAutocomplete from '@/components/search/SearchAutocomplete'

interface HeaderProps {
  profile: Profile
  onOpenMobileNav: () => void
}

export default function Header({ profile, onOpenMobileNav }: HeaderProps) {
  const router = useRouter()
  const supabase = createClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="relative flex h-16 flex-shrink-0 items-center gap-3 border-b border-border bg-surface px-4 md:px-6">
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-raised md:hidden"
      >
        <Menu size={18} />
      </button>

      <SearchAutocomplete className="hidden max-w-sm flex-1 sm:block" />

      <div className="flex-1 sm:hidden" />

      <button
        type="button"
        onClick={() => setMobileSearchOpen(true)}
        aria-label="Search"
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-raised sm:hidden"
      >
        <Search size={16} />
      </button>

      {/* Phone: the search field takes over the header row (the icon above opens it), so the
          suggestion list gets the full width instead of being squeezed between the controls. */}
      {mobileSearchOpen && (
        <div className="absolute inset-0 z-40 flex items-center gap-2 bg-surface px-4 sm:hidden">
          <SearchAutocomplete
            autoFocus
            className="min-w-0 flex-1"
            onDone={() => setMobileSearchOpen(false)}
            onEscape={() => setMobileSearchOpen(false)}
          />
          <button
            type="button"
            onClick={() => setMobileSearchOpen(false)}
            aria-label="Close search"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-raised"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ml-auto pins the theme/notification/account controls to the far right edge
          (the search form is max-w-sm, so without it they sat right beside it). */}
      <div className="ml-auto flex flex-shrink-0 items-center gap-2">
        <ThemeToggle />
        <NotificationBell />

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-xs hover:bg-surface-raised"
          >
            <Avatar name={profile.display_name || profile.email} src={profile.avatar_url} size={24} />
            <span className="hidden max-w-[9rem] truncate font-medium text-text-primary md:inline">
              {profile.display_name || profile.email}
            </span>
            <ChevronDown size={12} className="text-text-muted" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-11 z-40 w-48 rounded-xl border border-border bg-surface-raised p-1.5 shadow-panel">
                <div className="px-2.5 py-2 text-[11px]">
                  <div className="truncate font-semibold text-text-primary">{profile.display_name || 'Unnamed'}</div>
                  <div className="truncate text-text-muted">{profile.email}</div>
                </div>
                <div className="my-1 border-t border-border" />
                <Link
                  href="/account"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-text-secondary hover:bg-surface hover:text-text-primary"
                >
                  <UserCog size={14} /> Account
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-rose-400 hover:bg-rose-500/10"
                >
                  <LogOut size={14} /> Log out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

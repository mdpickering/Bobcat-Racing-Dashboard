'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Menu as MenuIcon, Search, X, LogOut, ChevronDown, UserCog } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types/user'
import type { WorkspaceId } from '@/lib/workspaceAccess'
import Avatar from '@/components/ui/Avatar'
import Menu from '@/components/ui/Menu'
import ThemeToggle from '@/components/theme/ThemeToggle'
import NotificationBell from '@/components/notifications/NotificationBell'
import SearchAutocomplete from '@/components/search/SearchAutocomplete'
import WorkspaceSwitcher from './WorkspaceSwitcher'

interface HeaderProps {
  profile: Profile
  workspace: WorkspaceId
  available: WorkspaceId[]
  onOpenMobileNav: () => void
}

export default function Header({ profile, workspace, available, onOpenMobileNav }: HeaderProps) {
  const router = useRouter()
  const supabase = createClient()
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="relative flex h-16 flex-shrink-0 items-center gap-2 border-b border-border bg-surface px-3 md:gap-3 md:px-6">
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-raised md:hidden"
      >
        <MenuIcon size={18} />
      </button>

      {/* Phones only: the ONE workspace switcher moves here from the sidebar (which is a drawer on phones). */}
      <div className="md:hidden">
        <WorkspaceSwitcher current={workspace} available={available} variant="header" />
      </div>

      <SearchAutocomplete className="hidden max-w-sm flex-1 sm:block" />

      <div className="flex-1 sm:hidden" />

      <button
        type="button"
        onClick={() => setMobileSearchOpen(true)}
        aria-label="Search"
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-raised sm:hidden"
      >
        <Search size={16} />
      </button>

      {/* Phone: the search field takes over the header row (the icon above opens it), so the
          suggestion list gets the full width instead of being squeezed between the controls. */}
      {mobileSearchOpen && (
        <div className="absolute inset-0 z-40 flex items-center gap-2 bg-surface px-4 sm:hidden">
          <SearchAutocomplete autoFocus className="min-w-0 flex-1" onDone={() => setMobileSearchOpen(false)} onEscape={() => setMobileSearchOpen(false)} />
          <button
            type="button"
            onClick={() => setMobileSearchOpen(false)}
            aria-label="Close search"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-raised"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ml-auto pins the theme/notification/account controls to the far right edge. */}
      <div className="ml-auto flex flex-shrink-0 items-center gap-1.5 md:gap-2">
        <ThemeToggle />
        <NotificationBell />

        <Menu
          label="Account"
          placement="bottom-end"
          panelClassName="w-52"
          trigger={({ triggerProps }) => (
            <button type="button" {...triggerProps} aria-label="Account menu" className="flex items-center gap-2 rounded-lg border border-border px-1.5 py-1.5 text-xs hover:bg-surface-raised md:px-2">
              <Avatar name={profile.display_name || profile.email} src={profile.avatar_url} size={24} />
              <span className="hidden max-w-[9rem] truncate font-medium text-text-primary md:inline">{profile.display_name || profile.email}</span>
              <ChevronDown size={12} className="hidden text-text-muted md:block" aria-hidden="true" />
            </button>
          )}
        >
          {({ close }) => (
            <>
              <div className="px-2.5 py-2 text-xs">
                <div className="truncate font-semibold text-text-primary">{profile.display_name || 'Unnamed'}</div>
                <div className="truncate text-text-muted">{profile.email}</div>
              </div>
              <div className="my-1 border-t border-border" />
              <Link
                href="/account"
                role="menuitem"
                onClick={close}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-text-secondary hover:bg-surface hover:text-text-primary focus:bg-surface"
              >
                <UserCog size={14} aria-hidden="true" /> Account
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-status-danger hover:bg-status-danger/10 focus:bg-status-danger/10"
              >
                <LogOut size={14} aria-hidden="true" /> Log out
              </button>
            </>
          )}
        </Menu>
      </div>
    </header>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import type { Profile } from '@/types/user'
import { readSidebarCollapsed, writeSidebarCollapsed } from '@/lib/sidebarPreference'
import { resolveShellWorkspace, workspaceToRemember, type WorkspaceId } from '@/lib/workspaceAccess'
import { rememberWorkspace } from '@/lib/workspacePreference'
import { ToastProvider } from '@/components/ui/Toast'
import Sidebar from './Sidebar'
import Header from './Header'

interface AppShellProps {
  profile: Profile
  // computed on the server from the person's real access (lib/supabase/queries/workspaces.ts)
  available: WorkspaceId[]
  // the remembered workspace if still allowed, else the role-based default
  startWorkspace: WorkspaceId
  children: React.ReactNode
}

export default function AppShell({ profile, available, startWorkspace, children }: AppShellProps) {
  const pathname = usePathname() ?? ''
  const [mobileOpen, setMobileOpen] = useState(false)
  // Layout is driven by <html data-sidebar> (set before first paint); this state only
  // mirrors it for aria attributes and the collapsed-rail tooltips.
  const [collapsed, setCollapsed] = useState(false)

  // The workspace follows the page: workspace-only pages (/business, /operations, /dashboard…) pick their own; shared
  // pages (/purchasing, /calendar, /timeline, /notifications…) keep the workspace you are already in.
  // lastUsed is client state: the layout does not re-render on client-side navigation, so the server-provided start
  // value alone would go stale as soon as the person switches workspace.
  const [lastUsed, setLastUsed] = useState<WorkspaceId>(startWorkspace)
  const workspace = resolveShellWorkspace(pathname, available, lastUsed, startWorkspace)

  useEffect(() => {
    setCollapsed(readSidebarCollapsed())
  }, [])

  useEffect(() => {
    const remember = workspaceToRemember(pathname, workspace)
    if (remember) {
      setLastUsed(remember)
      rememberWorkspace(remember)
    }
  }, [pathname, workspace])

  // close the drawer whenever the page changes
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  function toggleSidebar() {
    const next = !collapsed
    setCollapsed(next)
    writeSidebarCollapsed(next)
  }

  return (
    <ToastProvider>
      <div data-workspace={workspace} className="flex h-screen overflow-hidden bg-bg text-text-primary">
        <div className="hidden md:block">
          <Sidebar profile={profile} workspace={workspace} available={available} showSwitcher collapsible collapsed={collapsed} onToggleCollapsed={toggleSidebar} />
        </div>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
            <div className="relative flex h-full">
              <Sidebar profile={profile} workspace={workspace} available={available} onNavigate={() => setMobileOpen(false)} />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
                className="absolute right-[-44px] top-4 flex h-9 w-9 items-center justify-center rounded-lg bg-surface-raised text-text-secondary"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <Header profile={profile} workspace={workspace} available={available} onOpenMobileNav={() => setMobileOpen(true)} />
          <main className="flex-1 overflow-y-auto scrollbar-thin p-4 md:p-6">{children}</main>
        </div>
      </div>
    </ToastProvider>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ChevronsLeft, ShieldCheck } from 'lucide-react'
import { ADMIN_LINK, WORKSPACES, isNavItemActive } from '@/lib/workspaces'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import type { WorkspaceId } from '@/lib/workspaceAccess'
import type { Profile } from '@/types/user'
import { NAV_ICONS } from './navIcons'
import WorkspaceSwitcher from './WorkspaceSwitcher'

interface SidebarProps {
  profile: Profile
  workspace: WorkspaceId
  available: WorkspaceId[]
  onNavigate?: () => void
  // Desktop instance only: turns on the collapse toggle and icon-rail behaviour.
  // The mobile drawer omits these and always renders the full sidebar.
  collapsible?: boolean
  collapsed?: boolean
  onToggleCollapsed?: () => void
  // The desktop sidebar carries the one workspace switcher; on phones it lives in the header, so the drawer omits it.
  showSwitcher?: boolean
}

export default function Sidebar({ profile, workspace, available, onNavigate, collapsible = false, collapsed = false, onToggleCollapsed, showSwitcher = false }: SidebarProps) {
  const pathname = usePathname() ?? ''
  const params = useSearchParams()
  const railMode = collapsible && collapsed
  const [tip, setTip] = useState<{ label: string; top: number; left: number } | null>(null)
  const def = WORKSPACES[workspace]
  const adminActive = pathname === ADMIN_LINK.href || pathname.startsWith(`${ADMIN_LINK.href}/`)

  // Fixed-position tooltip: the nav list scrolls (overflow clips absolutely-positioned
  // children), and this also lets the label sit above the page content.
  function showTip(e: React.SyntheticEvent<HTMLElement>, label: string) {
    if (!railMode) return
    const r = e.currentTarget.getBoundingClientRect()
    setTip({ label, top: r.top + r.height / 2, left: r.right + 10 })
  }
  const hideTip = () => setTip(null)
  const tipHandlers = (label: string) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => showTip(e, label),
    onFocus: (e: React.FocusEvent<HTMLElement>) => showTip(e, label),
    onMouseLeave: hideTip,
    onBlur: hideTip,
  })

  return (
    <aside
      data-workspace={workspace}
      className={`flex h-full w-64 flex-shrink-0 flex-col overflow-hidden border-r border-border bg-surface ${collapsible ? 'sidebar-collapsible' : ''}`}
    >
      <div className="flex h-16 flex-shrink-0 items-center gap-2.5 overflow-hidden border-b border-border pl-4 pr-5">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-qu-gold text-sm font-black text-qu-navy">B</div>
        <div className="sidebar-label text-sm font-bold tracking-wide text-text-primary">BOBCAT RACING</div>
      </div>

      {showSwitcher ? (
        <div className="flex-shrink-0 px-3 pt-3">
          <WorkspaceSwitcher current={workspace} available={available} variant="sidebar" railMode={railMode} />
        </div>
      ) : (
        <div className="flex flex-shrink-0 items-center gap-2 px-6 pt-4 text-xs font-semibold uppercase tracking-wider text-text-primary">
          <span className="h-2 w-2 rounded-sm bg-ws" aria-hidden="true" />
          {def.label}
        </div>
      )}

      <nav aria-label={`${def.label} navigation`} className="flex-1 overflow-y-auto scrollbar-thin px-3 pb-3 pt-2">
        {collapsible && (
          <button
            type="button"
            onClick={() => {
              hideTip()
              onToggleCollapsed?.()
            }}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="sidebar-link flex w-full items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary"
            {...tipHandlers('Expand sidebar')}
          >
            <ChevronsLeft size={16} className="sidebar-toggle-icon flex-shrink-0" aria-hidden="true" />
            <span className="sidebar-label">Collapse sidebar</span>
          </button>
        )}

        {def.groups.map((group) => (
          <div key={group.label} className="sidebar-group">
            <div className="sidebar-group-label px-3 pb-1 pt-3 text-2xs font-medium text-text-muted">{group.label}</div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = NAV_ICONS[item.icon]
                if (item.status === 'soon' || !item.href) {
                  // planned, not built: listed so the structure is visible, but not a link and it has no route
                  return (
                    <div
                      key={item.label}
                      aria-disabled="true"
                      tabIndex={-1}
                      className="sidebar-link flex cursor-default items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium text-text-muted/70"
                      {...tipHandlers(`${item.label} — coming soon`)}
                    >
                      <Icon size={16} className="flex-shrink-0" aria-hidden="true" />
                      <span className="sidebar-label flex flex-1 items-center justify-between gap-2">
                        {item.label}
                        <span className="rounded-full border border-border px-1.5 text-2xs font-normal text-text-muted">Soon</span>
                      </span>
                    </div>
                  )
                }
                const active = isNavItemActive(item, pathname, params)
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={`sidebar-link flex items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? 'bg-surface-raised text-text-primary shadow-[inset_2px_0_0_rgb(var(--ws-accent))]'
                        : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary'
                    }`}
                    {...tipHandlers(item.label)}
                  >
                    <Icon size={16} className={`flex-shrink-0 ${active ? 'text-ws' : 'text-text-muted'}`} aria-hidden="true" />
                    <span className="sidebar-label">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex-shrink-0 border-t border-border p-3">
        {isCtoOrAdmin(profile) && (
          <Link
            href={ADMIN_LINK.href}
            onClick={onNavigate}
            aria-current={adminActive ? 'page' : undefined}
            className={`sidebar-link flex items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              adminActive ? 'bg-surface-raised text-text-primary shadow-[inset_2px_0_0_rgb(var(--ws-accent))]' : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary'
            }`}
            {...tipHandlers(ADMIN_LINK.label)}
          >
            <ShieldCheck size={16} className={`flex-shrink-0 ${adminActive ? 'text-ws' : 'text-text-muted'}`} aria-hidden="true" />
            <span className="sidebar-label">{ADMIN_LINK.label}</span>
          </Link>
        )}
        <div className="sidebar-footer px-3 pt-2">
          <div className="text-2xs text-text-muted">Signed in as</div>
          <div className="mt-0.5 truncate text-xs font-semibold text-text-primary">{profile.display_name || profile.email}</div>
          <div className="text-2xs text-text-secondary">{profile.role.replace('_', ' ')}</div>
        </div>
      </div>

      {tip && (
        <div
          role="tooltip"
          style={{ top: tip.top, left: tip.left }}
          className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-xs font-medium text-text-primary shadow-panel"
        >
          {tip.label}
        </div>
      )}
    </aside>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronsLeft } from 'lucide-react'
import { NAV_ITEMS, ADMIN_NAV_ITEMS, OPERATIONS_NAV_ITEMS } from '@/lib/navigation'
import { isCtoOrAdmin, canManageOperations } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'

interface SidebarProps {
  profile: Profile
  onNavigate?: () => void
  // Desktop instance only: turns on the collapse toggle and icon-rail behaviour.
  // The mobile drawer omits these and always renders the full sidebar.
  collapsible?: boolean
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

export default function Sidebar({ profile, onNavigate, collapsible = false, collapsed = false, onToggleCollapsed }: SidebarProps) {
  const pathname = usePathname()
  const railMode = collapsible && collapsed
  const [tip, setTip] = useState<{ label: string; top: number; left: number } | null>(null)
  // Operations for coo/cto/admin, Administration for cto/admin only.
  const managementNavItems = [
    ...(canManageOperations(profile) ? OPERATIONS_NAV_ITEMS : []),
    ...(isCtoOrAdmin(profile) ? ADMIN_NAV_ITEMS : []),
  ]

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
      className={`flex h-full w-64 flex-shrink-0 flex-col overflow-hidden border-r border-border bg-surface ${
        collapsible ? 'sidebar-collapsible' : ''
      }`}
    >
      <div className="flex h-16 flex-shrink-0 items-center gap-2 overflow-hidden border-b border-border pl-4 pr-5">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-qu-gold font-mono text-sm font-black text-qu-navy">
          B
        </div>
        <div className="sidebar-label leading-tight">
          <div className="text-sm font-bold tracking-wide text-text-primary">BOBCAT RACING</div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-text-muted">Engineering Ops</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto scrollbar-thin p-3">
        {collapsible && (
          <>
            <button
              type="button"
              onClick={() => {
                hideTip()
                onToggleCollapsed?.()
              }}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="sidebar-link flex w-full items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary"
              {...tipHandlers('Expand sidebar')}
            >
              <ChevronsLeft size={16} className="sidebar-toggle-icon flex-shrink-0" />
              <span className="sidebar-label">Collapse sidebar</span>
            </button>
            <div className="!my-2 border-t border-border" />
          </>
        )}

        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(`${item.href}/`)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={`sidebar-link flex items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                active
                  ? 'bg-accent-blue/15 text-text-primary'
                  : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary'
              }`}
              {...tipHandlers(item.label)}
            >
              <Icon size={16} className={`flex-shrink-0 ${active ? 'text-accent-blue' : 'text-text-muted'}`} />
              <span className="sidebar-label">{item.label}</span>
            </Link>
          )
        })}

        {managementNavItems.length > 0 && (
          <>
            <div className="my-2 border-t border-border" />
            {managementNavItems.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(`${item.href}/`)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={`sidebar-link sidebar-link--admin flex items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-qu-gold/15 text-qu-gold'
                      : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary'
                  }`}
                  {...tipHandlers(item.label)}
                >
                  <Icon size={16} className={`flex-shrink-0 ${active ? 'text-qu-gold' : 'text-text-muted'}`} />
                  <span className="sidebar-label">{item.label}</span>
                </Link>
              )
            })}
          </>
        )}
      </nav>

      <div className="sidebar-footer flex-shrink-0 border-t border-border p-4">
        <div className="text-[10px] font-mono uppercase tracking-widest text-text-muted">Signed in as</div>
        <div className="mt-1 truncate text-xs font-semibold text-text-primary">
          {profile.display_name || profile.email}
        </div>
        <div className="mt-0.5 text-[10px] font-mono uppercase tracking-wide text-qu-gold">
          {profile.role.replace('_', ' ')}
        </div>
      </div>

      {tip && (
        <div
          role="tooltip"
          style={{ top: tip.top, left: tip.left }}
          className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-[11px] font-medium text-text-primary shadow-panel"
        >
          {tip.label}
        </div>
      )}
    </aside>
  )
}

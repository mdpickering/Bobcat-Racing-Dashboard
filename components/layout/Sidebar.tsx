'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_ITEMS, ADMIN_NAV_ITEMS } from '@/lib/navigation'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'

interface SidebarProps {
  profile: Profile
  onNavigate?: () => void
}

export default function Sidebar({ profile, onNavigate }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="flex h-full w-64 flex-shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-qu-gold font-mono text-sm font-black text-qu-navy">
          B
        </div>
        <div className="leading-tight">
          <div className="text-sm font-bold tracking-wide text-text-primary">BOBCAT RACING</div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-text-muted">Engineering Ops</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto scrollbar-thin p-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(`${item.href}/`)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                active
                  ? 'bg-accent-blue/15 text-text-primary'
                  : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary'
              }`}
            >
              <Icon size={16} className={active ? 'text-accent-blue' : 'text-text-muted'} />
              {item.label}
            </Link>
          )
        })}

        {isCtoOrAdmin(profile) && (
          <>
            <div className="my-2 border-t border-border" />
            {ADMIN_NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(`${item.href}/`)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-qu-gold/15 text-qu-gold'
                      : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary'
                  }`}
                >
                  <Icon size={16} className={active ? 'text-qu-gold' : 'text-text-muted'} />
                  {item.label}
                </Link>
              )
            })}
          </>
        )}
      </nav>

      <div className="border-t border-border p-4">
        <div className="text-[10px] font-mono uppercase tracking-widest text-text-muted">Signed in as</div>
        <div className="mt-1 truncate text-xs font-semibold text-text-primary">
          {profile.display_name || profile.email}
        </div>
        <div className="mt-0.5 text-[10px] font-mono uppercase tracking-wide text-qu-gold">
          {profile.role.replace('_', ' ')}
        </div>
      </div>
    </aside>
  )
}

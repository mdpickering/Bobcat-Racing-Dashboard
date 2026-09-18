'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/applications', label: 'Applications' },
  { href: '/admin/competition', label: 'Competition' },
  { href: '/admin/audit', label: 'Audit' },
]

export default function AdminNav() {
  const pathname = usePathname()

  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
      {TABS.map((tab) => {
        const active = tab.href === '/admin' ? pathname === '/admin' : pathname?.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              active ? 'bg-qu-gold/15 text-qu-gold' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}

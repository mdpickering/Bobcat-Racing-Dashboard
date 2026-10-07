'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { WORKSPACES } from '@/lib/workspaces'
import type { WorkspaceId } from '@/lib/workspaceAccess'

const LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  tasks: 'My tasks',
  calendar: 'Calendar',
  subsystems: 'Subsystems',
  cad: 'CAD review',
  purchasing: 'Purchasing',
  parts: 'Parts',
  inventory: 'Inventory',
  receiving: 'Receiving',
  timeline: 'Timeline',
  milestones: 'Milestones',
  meetings: 'Technical meetings',
  operations: 'Operations',
  business: 'Business',
  admin: 'Administration',
  account: 'Account',
  notifications: 'Notifications',
  search: 'Search',
  deadlines: 'Deadlines',
  events: 'Events',
  sponsorships: 'Sponsorships',
  sponsors: 'Sponsors',
  vendors: 'Vendors',
  team: 'Team',
  users: 'Users',
  applications: 'Applications',
  competition: 'Competition',
  audit: 'Audit log',
}

function labelFor(segment: string): string {
  return LABELS[segment] ?? 'Details'
}

// "Workspace / Section / Page" for the current route, derived from the URL, so a page 3+ levels deep always says where
// it sits and every ancestor is one click away. The workspace itself is the first crumb; its home page reads "Overview".
export default function Breadcrumb({ workspace, className = '' }: { workspace: WorkspaceId; className?: string }) {
  const pathname = usePathname() ?? ''
  const def = WORKSPACES[workspace]
  const segments = pathname.split('/').filter(Boolean)

  const crumbs: { label: string; href: string }[] = [{ label: def.label, href: def.home }]
  let href = ''
  segments.forEach((seg, i) => {
    href += `/${seg}`
    // A workspace's home (/operations, /business) is the workspace crumb itself, shown as "Overview" when it is the page.
    if (i === 0 && LABELS[seg] === def.label) {
      if (segments.length === 1) crumbs.push({ label: 'Overview', href })
      return
    }
    // /business/sponsors has no index page of its own; its crumb leads to the sponsorships list.
    if (seg === 'sponsors') {
      crumbs.push({ label: 'Sponsorships', href: '/business/sponsorships' })
      return
    }
    crumbs.push({ label: labelFor(seg), href })
  })

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex min-w-0 items-center gap-1.5 text-xs text-text-muted">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <li key={`${c.href}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <ChevronRight size={12} className="flex-shrink-0" aria-hidden="true" />}
              {last ? (
                <span aria-current="page" className="truncate font-medium text-text-primary">
                  {c.label}
                </span>
              ) : (
                <Link href={c.href} className="truncate transition-colors hover:text-text-primary">
                  {c.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

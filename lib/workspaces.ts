import type { WorkspaceId } from '@/lib/workspaceAccess'

// Navigation for all three workspaces lives here and nowhere else. The sidebar renders it; adding a feature later
// is one entry flipped from 'soon' to 'available' (plus its route). 'soon' entries are listed but are NOT links,
// have no route, and show no data.

// Icon names, resolved to components in components/layout/navIcons.ts (kept as strings so this file stays plain data).
export type NavIconName =
  | 'dashboard'
  | 'tasks'
  | 'calendar'
  | 'subsystems'
  | 'cad'
  | 'requests'
  | 'purchasing'
  | 'timeline'
  | 'milestones'
  | 'sponsorships'
  | 'budget'
  | 'parts'
  | 'inventory'
  | 'vendors'
  | 'reports'
  | 'team'
  | 'deadlines'
  | 'events'
  | 'schedule'
  | 'operations'
  | 'business'

export interface NavItemDef {
  label: string
  icon: NavIconName
  status: 'available' | 'soon'
  // required for 'available', forbidden for 'soon'
  href?: string
  // items that share a path (e.g. Tasks and Task Requests are both /tasks) say when they are the active one
  activeWhen?: (pathname: string, params: { get(name: string): string | null }) => boolean
}

export interface NavGroupDef {
  label: string
  items: NavItemDef[]
}

export interface WorkspaceDef {
  id: WorkspaceId
  label: string
  // one line, shown in the switcher
  description: string
  home: string
  groups: NavGroupDef[]
}

const isTasksBoard = (pathname: string, params: { get(name: string): string | null }) =>
  (pathname === '/tasks' && params.get('tab') !== 'requests') || pathname.startsWith('/tasks/')
const isTaskRequests = (pathname: string, params: { get(name: string): string | null }) => pathname === '/tasks' && params.get('tab') === 'requests'

export const WORKSPACES: Record<WorkspaceId, WorkspaceDef> = {
  engineering: {
    id: 'engineering',
    label: 'Engineering',
    description: 'Tasks, subsystems, CAD and the build',
    home: '/dashboard',
    groups: [
      {
        label: 'Workspace',
        items: [
          { label: 'Dashboard', icon: 'dashboard', status: 'available', href: '/dashboard' },
          // /tasks has always been each person's own board (only tasks they own or co-own)
          { label: 'My Tasks', icon: 'tasks', status: 'available', href: '/tasks', activeWhen: isTasksBoard },
          { label: 'Calendar', icon: 'calendar', status: 'available', href: '/calendar' },
        ],
      },
      {
        label: 'Engineering',
        items: [
          { label: 'Subsystems', icon: 'subsystems', status: 'available', href: '/subsystems' },
          { label: 'CAD Review', icon: 'cad', status: 'available', href: '/cad' },
          { label: 'Task Requests', icon: 'requests', status: 'available', href: '/tasks?tab=requests', activeWhen: isTaskRequests },
          { label: 'Purchasing', icon: 'purchasing', status: 'available', href: '/purchasing' },
        ],
      },
      {
        label: 'Planning',
        items: [
          { label: 'Timeline', icon: 'timeline', status: 'available', href: '/timeline' },
          { label: 'Milestones', icon: 'milestones', status: 'available', href: '/milestones' },
        ],
      },
    ],
  },
  business: {
    id: 'business',
    label: 'Business',
    description: 'Purchasing, sponsorships and finances',
    home: '/business',
    groups: [
      {
        label: 'Workspace',
        items: [{ label: 'Business Dashboard', icon: 'dashboard', status: 'available', href: '/business', activeWhen: (p) => p === '/business' }],
      },
      {
        label: 'Finance',
        items: [
          { label: 'Purchasing', icon: 'purchasing', status: 'available', href: '/purchasing' },
          { label: 'Sponsorships', icon: 'sponsorships', status: 'available', href: '/business/sponsorships', activeWhen: (p) => p.startsWith('/business/sponsor') },
          { label: 'Budget', icon: 'budget', status: 'soon' },
        ],
      },
      {
        label: 'Assets',
        items: [
          { label: 'Parts', icon: 'parts', status: 'soon' },
          { label: 'Inventory', icon: 'inventory', status: 'soon' },
          { label: 'Vendors', icon: 'vendors', status: 'soon' },
        ],
      },
      { label: 'Reporting', items: [{ label: 'Reports', icon: 'reports', status: 'soon' }] },
      { label: 'Team', items: [{ label: 'Business Team', icon: 'team', status: 'available', href: '/business/team' }] },
    ],
  },
  operations: {
    id: 'operations',
    label: 'Operations',
    description: 'Schedule, events, deadlines and timeline',
    home: '/operations',
    groups: [
      { label: 'Workspace', items: [{ label: 'Operations Dashboard', icon: 'operations', status: 'available', href: '/operations', activeWhen: (p) => p === '/operations' }] },
      {
        label: 'Schedule',
        items: [
          { label: 'Calendar', icon: 'calendar', status: 'available', href: '/calendar' },
          { label: 'Timeline', icon: 'timeline', status: 'available', href: '/timeline' },
          { label: 'Deadlines', icon: 'deadlines', status: 'available', href: '/operations/deadlines' },
          { label: 'Events', icon: 'events', status: 'available', href: '/operations/events' },
        ],
      },
      {
        label: 'Overview',
        items: [
          { label: 'Subsystem Schedule', icon: 'subsystems', status: 'available', href: '/operations/subsystems' },
          { label: 'Team Schedule', icon: 'schedule', status: 'soon' },
        ],
      },
    ],
  },
}

// Pinned at the bottom of every sidebar for cto/admin; the /admin pages also enforce this themselves.
export const ADMIN_LINK = { label: 'Administration', href: '/admin' }

export function isNavItemActive(item: NavItemDef, pathname: string, params: { get(name: string): string | null }): boolean {
  if (item.status !== 'available' || !item.href) return false
  if (item.activeWhen) return item.activeWhen(pathname, params)
  const path = item.href.split('?')[0]
  return pathname === path || pathname.startsWith(`${path}/`)
}

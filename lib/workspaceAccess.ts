// Workspaces: Engineering, Business and Operations are three views of ONE application, one account and one
// database. Which workspaces a person is offered is decided here, on the server (see
// lib/supabase/queries/workspaces.ts). This is navigation, not authorization: every page keeps its own check and
// Row Level Security is still the real boundary, so hiding a workspace never grants or removes data access.

export type WorkspaceId = 'engineering' | 'business' | 'operations'

export const WORKSPACE_IDS: WorkspaceId[] = ['engineering', 'business', 'operations']

export const WORKSPACE_COOKIE = 'bobcat-workspace'

export function isWorkspaceId(value: unknown): value is WorkspaceId {
  return typeof value === 'string' && (WORKSPACE_IDS as string[]).includes(value)
}

export interface WorkspaceFacts {
  role: 'member' | 'team_lead' | 'coo' | 'cto' | 'admin'
  // belongs to at least one engineering subsystem
  isSubsystemMember: boolean
  // sees the Business area: Business team members, the COO (read-only), cto/admin (lib/supabase/queries/business.ts)
  canViewBusiness: boolean
  // on the Business team itself
  isBusinessMember: boolean
  // COO, CTO or admin (public.can_manage_operations())
  canManageOperations: boolean
}

// A "Business-only" person is on the Business team and has no engineering footprint at all. They are not offered
// the Engineering workspace (they get the Engineering snapshot on the Business dashboard instead). Joining a
// subsystem, or holding an engineering-facing role, brings Engineering back.
export function isBusinessOnly(f: WorkspaceFacts): boolean {
  return f.isBusinessMember && !f.isSubsystemMember && f.role === 'member'
}

// In switcher order. Never empty: an approved account always has somewhere to land.
export function getAvailableWorkspaces(f: WorkspaceFacts): WorkspaceId[] {
  const available: WorkspaceId[] = []
  if (!isBusinessOnly(f)) available.push('engineering')
  if (f.canViewBusiness) available.push('business')
  if (f.canManageOperations) available.push('operations')
  return available.length > 0 ? available : ['engineering']
}

// Where someone lands when they have not chosen a workspace yet. A remembered choice always wins over this.
export function getDefaultWorkspace(f: WorkspaceFacts, available: WorkspaceId[]): WorkspaceId {
  const pick = (id: WorkspaceId) => (available.includes(id) ? id : null)
  if (f.role === 'coo') return pick('operations') ?? available[0]
  if (isBusinessOnly(f)) return pick('business') ?? available[0]
  if (f.isSubsystemMember || f.role === 'team_lead' || f.role === 'cto' || f.role === 'admin') return pick('engineering') ?? available[0]
  return available[0]
}

// The remembered (cookie) choice, only if it is still allowed.
export function getStartWorkspace(f: WorkspaceFacts, available: WorkspaceId[], remembered: unknown): WorkspaceId {
  return isWorkspaceId(remembered) && available.includes(remembered) ? remembered : getDefaultWorkspace(f, available)
}

// ---------------------------------------------------------
// Routes -> workspaces. URLs do not change with the redesign (notification, email and search links keep working),
// so the workspace is derived from the path. Some routes belong to more than one workspace; for those the shell
// keeps whichever workspace the person is already in.
// ---------------------------------------------------------
const ROUTE_WORKSPACES: { prefix: string; workspaces: WorkspaceId[] }[] = [
  { prefix: '/dashboard', workspaces: ['engineering'] },
  { prefix: '/tasks', workspaces: ['engineering'] },
  { prefix: '/subsystems', workspaces: ['engineering'] },
  { prefix: '/cad', workspaces: ['engineering'] },
  { prefix: '/milestones', workspaces: ['engineering'] },
  // Technical meetings (migration 0041): the CTO/Admin run them from Engineering, the COO records
  // them from Operations — one route, one data set, same as inventory/receiving above.
  { prefix: '/meetings', workspaces: ['engineering', 'operations'] },
  { prefix: '/business', workspaces: ['business'] },
  { prefix: '/operations', workspaces: ['operations'] },
  // Purchasing is one system used from both sides: engineering creates and works requests, business manages,
  // approves and exports them. There is one route and one data set.
  { prefix: '/purchasing', workspaces: ['business', 'engineering'] },
  // The parts catalog is primarily engineering's; Business gets the same page read-only (one route, one data set).
  { prefix: '/parts', workspaces: ['engineering', 'business'] },
  // Inventory + receiving (migration 0038): shared routes, never /operations/*, so Engineering team leads (who
  // cannot open /operations at all) can still receive and adjust stock for their own subsystem. Business is
  // read-only here (lib/permissions/roles.ts); Operations is where receiving/adjusting is a primary job.
  { prefix: '/inventory', workspaces: ['engineering', 'business', 'operations'] },
  { prefix: '/receiving', workspaces: ['engineering', 'business', 'operations'] },
  { prefix: '/calendar', workspaces: ['engineering', 'operations'] },
  { prefix: '/timeline', workspaces: ['engineering', 'operations'] },
]

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

// The workspaces a path belongs to; empty for shared chrome such as /notifications, /search, /account and /admin.
export function workspacesForPath(pathname: string): WorkspaceId[] {
  return ROUTE_WORKSPACES.find((r) => matchesPrefix(pathname, r.prefix))?.workspaces ?? []
}

// The workspace the shell shows for the current page.
export function resolveShellWorkspace(pathname: string, available: WorkspaceId[], lastUsed: WorkspaceId, fallback: WorkspaceId): WorkspaceId {
  const owners = workspacesForPath(pathname)
  if (owners.length === 0) return available.includes(lastUsed) ? lastUsed : fallback
  const usable = owners.filter((w) => available.includes(w))
  if (usable.length === 0) return available.includes(lastUsed) ? lastUsed : fallback
  if (usable.length === 1) return usable[0]
  return usable.includes(lastUsed) ? lastUsed : usable[0]
}

// A page that belongs to exactly one workspace is a positive signal that this is where the person is working, so
// it is remembered. Shared pages never overwrite the remembered workspace.
export function workspaceToRemember(pathname: string, shell: WorkspaceId): WorkspaceId | null {
  return workspacesForPath(pathname).length === 1 ? shell : null
}

import type { WorkspaceFacts } from '@/lib/workspaceAccess'

// The sidebar shows each person only the entries they are likely to use, so an ordinary member is not faced with the
// whole management toolset. This is navigation only: every page keeps its own access check and Row Level Security is still the
// real boundary, so hiding an entry never removes access (the page is still there by its link) and never grants any.
//
//   member  every approved person
//   lead    subsystem leads, team leads and the COO, who run parts of the build and the schedule
//   admin   the CTO and admins, who see everything

export type NavLevel = 'member' | 'lead' | 'admin'

const RANK: Record<NavLevel, number> = { member: 0, lead: 1, admin: 2 }

export function getNavLevel(facts: Pick<WorkspaceFacts, 'role'> & { isSubsystemLead: boolean }): NavLevel {
  if (facts.role === 'cto' || facts.role === 'admin') return 'admin'
  if (facts.role === 'team_lead' || facts.role === 'coo' || facts.isSubsystemLead) return 'lead'
  return 'member'
}

/** An item with no audience is for everyone; otherwise the person's level must be at least the item's. */
export function isNavItemVisible(item: { audience?: NavLevel }, level: NavLevel): boolean {
  return RANK[level] >= RANK[item.audience ?? 'member']
}

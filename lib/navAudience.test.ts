import { describe, expect, it } from 'vitest'
import { getNavLevel, isNavItemVisible, type NavLevel } from './navAudience'
import { WORKSPACES } from './workspaces'
import type { WorkspaceId } from './workspaceAccess'

describe('getNavLevel', () => {
  it('gives the CTO and admins everything', () => {
    expect(getNavLevel({ role: 'admin', isSubsystemLead: false })).toBe('admin')
    expect(getNavLevel({ role: 'cto', isSubsystemLead: false })).toBe('admin')
  })
  it('gives team leads, the COO and anyone who leads a subsystem the lead view', () => {
    expect(getNavLevel({ role: 'team_lead', isSubsystemLead: false })).toBe('lead')
    expect(getNavLevel({ role: 'coo', isSubsystemLead: false })).toBe('lead')
    expect(getNavLevel({ role: 'member', isSubsystemLead: true })).toBe('lead')
  })
  it('gives an ordinary member the short view', () => {
    expect(getNavLevel({ role: 'member', isSubsystemLead: false })).toBe('member')
  })
  it('lets an admin who is also a subsystem lead stay admin', () => {
    expect(getNavLevel({ role: 'admin', isSubsystemLead: true })).toBe('admin')
  })
})

describe('isNavItemVisible', () => {
  it('shows an item with no audience to everyone', () => {
    for (const level of ['member', 'lead', 'admin'] as NavLevel[]) expect(isNavItemVisible({}, level)).toBe(true)
  })
  it('shows a lead item to leads and admins but not members', () => {
    expect(isNavItemVisible({ audience: 'lead' }, 'member')).toBe(false)
    expect(isNavItemVisible({ audience: 'lead' }, 'lead')).toBe(true)
    expect(isNavItemVisible({ audience: 'lead' }, 'admin')).toBe(true)
  })
  it('shows an admin item only to admins', () => {
    expect(isNavItemVisible({ audience: 'admin' }, 'lead')).toBe(false)
    expect(isNavItemVisible({ audience: 'admin' }, 'admin')).toBe(true)
  })
})

// What each level actually sees in the real navigation.
const visible = (workspace: WorkspaceId, level: NavLevel) =>
  WORKSPACES[workspace].groups.flatMap((g) => g.items.filter((i) => i.status === 'available' && i.href && isNavItemVisible(i, level)).map((i) => i.label))

describe('the Engineering sidebar', () => {
  it('shows an ordinary member only the essentials', () => {
    expect(visible('engineering', 'member')).toEqual(['Dashboard', 'My Tasks', 'Pick Up a Task', 'Calendar', 'Subsystems', 'Purchasing', 'BOM Lookup', 'Timeline'])
  })
  it('keeps the management tools away from members', () => {
    const member = visible('engineering', 'member')
    for (const hidden of ['CAD Review', 'Task Requests', 'Needs Sorting', 'Add Several Tasks', 'Parts', 'Inventory', 'Milestones', 'Technical Meetings']) {
      expect(member).not.toContain(hidden)
    }
  })
  it('gives leads and admins every Engineering entry', () => {
    const all = visible('engineering', 'admin')
    expect(visible('engineering', 'lead')).toEqual(all)
    expect(all).toHaveLength(16)
  })
  it('shows a member a lot fewer entries than an admin', () => {
    expect(visible('engineering', 'member').length).toBeLessThan(visible('engineering', 'admin').length / 1.5)
  })
})

describe('the other workspaces', () => {
  it('are unchanged for everyone who can open them', () => {
    for (const ws of ['business', 'operations'] as WorkspaceId[]) {
      expect(visible(ws, 'member')).toEqual(visible(ws, 'admin'))
    }
  })
})

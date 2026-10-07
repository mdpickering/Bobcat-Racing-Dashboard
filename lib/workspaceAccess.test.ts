import { describe, expect, it } from 'vitest'
import {
  getAvailableWorkspaces,
  getDefaultWorkspace,
  getStartWorkspace,
  isBusinessOnly,
  resolveShellWorkspace,
  workspaceToRemember,
  workspacesForPath,
  type WorkspaceFacts,
} from './workspaceAccess'

const base: WorkspaceFacts = { role: 'member', isSubsystemMember: true, canViewBusiness: false, isBusinessMember: false, canManageOperations: false }

describe('available workspaces', () => {
  it('a plain member only gets Engineering', () => {
    expect(getAvailableWorkspaces(base)).toEqual(['engineering'])
  })
  it('the COO gets Operations (and Business read-only) in switcher order', () => {
    expect(getAvailableWorkspaces({ ...base, role: 'coo', canViewBusiness: true, canManageOperations: true })).toEqual(['engineering', 'business', 'operations'])
  })
  it('a Business-only member is not offered Engineering', () => {
    const f = { ...base, isSubsystemMember: false, isBusinessMember: true, canViewBusiness: true }
    expect(isBusinessOnly(f)).toBe(true)
    expect(getAvailableWorkspaces(f)).toEqual(['business'])
  })
  it('joining a subsystem brings Engineering back', () => {
    const f = { ...base, isSubsystemMember: true, isBusinessMember: true, canViewBusiness: true }
    expect(isBusinessOnly(f)).toBe(false)
    expect(getAvailableWorkspaces(f)).toEqual(['engineering', 'business'])
  })
  it('is never empty', () => {
    expect(getAvailableWorkspaces({ ...base, isSubsystemMember: false, isBusinessMember: true, canViewBusiness: false })).toEqual(['engineering'])
  })
})

describe('default and remembered workspace', () => {
  const coo: WorkspaceFacts = { ...base, role: 'coo', canViewBusiness: true, canManageOperations: true }
  it('the COO lands in Operations by default', () => {
    expect(getDefaultWorkspace(coo, getAvailableWorkspaces(coo))).toBe('operations')
  })
  it('a remembered choice wins only if it is still allowed', () => {
    const available = getAvailableWorkspaces(base)
    expect(getStartWorkspace(base, available, 'business')).toBe('engineering')
    expect(getStartWorkspace(coo, getAvailableWorkspaces(coo), 'business')).toBe('business')
    expect(getStartWorkspace(coo, getAvailableWorkspaces(coo), 'nonsense')).toBe('operations')
  })
})

describe('routes to workspaces', () => {
  it('maps single-workspace routes', () => {
    expect(workspacesForPath('/dashboard')).toEqual(['engineering'])
    expect(workspacesForPath('/operations/deadlines')).toEqual(['operations'])
    expect(workspacesForPath('/business/sponsorships/abc')).toEqual(['business'])
  })
  it('a single task is a shared destination, but the My Tasks board is Engineering only', () => {
    expect(workspacesForPath('/tasks')).toEqual(['engineering'])
    expect(workspacesForPath('/tasks/123')).toEqual(['engineering', 'business', 'operations'])
  })
  it('shared routes list every workspace that uses them', () => {
    expect(workspacesForPath('/purchasing')).toEqual(['business', 'engineering'])
    expect(workspacesForPath('/meetings/xyz')).toEqual(['engineering', 'operations'])
  })
  it('shared chrome belongs to no workspace', () => {
    expect(workspacesForPath('/notifications')).toEqual([])
    expect(workspacesForPath('/admin/users')).toEqual([])
  })
})

describe('shell workspace for a page', () => {
  const all = ['engineering', 'business', 'operations'] as const
  it('keeps the workspace the person is already in on a shared route', () => {
    expect(resolveShellWorkspace('/calendar', [...all], 'operations', 'engineering')).toBe('operations')
    expect(resolveShellWorkspace('/calendar', [...all], 'business', 'engineering')).toBe('engineering')
  })
  it('opening a task from Operations does not hijack the workspace', () => {
    expect(resolveShellWorkspace('/tasks/123', [...all], 'operations', 'engineering')).toBe('operations')
  })
  it('a single-workspace route wins over the last-used workspace', () => {
    expect(resolveShellWorkspace('/operations', [...all], 'engineering', 'engineering')).toBe('operations')
  })
  it('falls back when the person cannot use the page workspace or the page is shared chrome', () => {
    expect(resolveShellWorkspace('/operations', ['engineering'], 'engineering', 'engineering')).toBe('engineering')
    expect(resolveShellWorkspace('/notifications', ['engineering', 'business'], 'business', 'engineering')).toBe('business')
  })
  it('only single-workspace pages are remembered', () => {
    expect(workspaceToRemember('/operations', 'operations')).toBe('operations')
    expect(workspaceToRemember('/calendar', 'operations')).toBeNull()
  })
})

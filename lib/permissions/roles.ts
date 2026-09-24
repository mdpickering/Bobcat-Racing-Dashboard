import type { Profile, UserRole } from '@/types/user'

export function isAdmin(profile: Pick<Profile, 'role'> | null | undefined): boolean {
  return profile?.role === 'admin'
}

export function isCto(profile: Pick<Profile, 'role'> | null | undefined): boolean {
  return profile?.role === 'cto'
}

export function isCtoOrAdmin(profile: Pick<Profile, 'role'> | null | undefined): boolean {
  return profile?.role === 'cto' || profile?.role === 'admin'
}

export function isTeamLead(profile: Pick<Profile, 'role'> | null | undefined): boolean {
  return profile?.role === 'team_lead'
}

export function isCoo(profile: Pick<Profile, 'role'> | null | undefined): boolean {
  return profile?.role === 'coo'
}

/**
 * Who may manage the shared operations schedule (calendar events, recurring events, milestones,
 * the master timeline, and task deadlines): the COO, plus cto/admin. Mirrors
 * public.can_manage_operations() (migration 0028), which is the real enforcement — this only
 * decides what to show. It grants no user-management, purchasing or CAD authority.
 */
export function canManageOperations(profile: Pick<Profile, 'role'> | null | undefined): boolean {
  return isCoo(profile) || isCtoOrAdmin(profile)
}

/**
 * Who may approve or decline a task request: cto/admin for any subsystem, or a team lead
 * (profile role 'team_lead') for the subsystems they lead. A plain member never can, even if
 * they were flagged as a subsystem lead. Mirrors public.can_review_task_request() (migration
 * 0022), which is the real enforcement — this only decides whether to show the buttons.
 */
export function canReviewTaskRequest(
  profile: Pick<Profile, 'role'> | null | undefined,
  ledSubsystemIds: ReadonlySet<string>,
  subsystemId: string
): boolean {
  if (isCtoOrAdmin(profile)) return true
  return isTeamLead(profile) && ledSubsystemIds.has(subsystemId)
}

export function hasRole(
  profile: Pick<Profile, 'role'> | null | undefined,
  roles: UserRole[]
): boolean {
  return !!profile && roles.includes(profile.role)
}

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

export function hasRole(
  profile: Pick<Profile, 'role'> | null | undefined,
  roles: UserRole[]
): boolean {
  return !!profile && roles.includes(profile.role)
}

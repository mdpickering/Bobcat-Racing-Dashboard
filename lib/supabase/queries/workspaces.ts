import type { SupabaseClient } from '@supabase/supabase-js'
import { getBusinessAccess } from '@/lib/supabase/queries/business'
import { canManageOperations } from '@/lib/permissions/roles'
import { getAvailableWorkspaces, getStartWorkspace, type WorkspaceFacts, type WorkspaceId } from '@/lib/workspaceAccess'
import { getNavLevel, type NavLevel } from '@/lib/navAudience'
import type { Profile } from '@/types/user'

export interface WorkspaceContext {
  facts: WorkspaceFacts
  available: WorkspaceId[]
  // the remembered workspace if still allowed, otherwise the role-based default
  start: WorkspaceId
  // how much of the sidebar this person is shown (lib/navAudience.ts): navigation only, never access
  navLevel: NavLevel
}

// Computed on the server for every page load. `remembered` is the browser's last-used workspace (a cookie), treated
// only as a hint and re-validated here. These facts come from the same helpers the pages and RLS already use, so
// the switcher can never offer a workspace whose pages would refuse the person.
export async function getWorkspaceContext(supabase: SupabaseClient, profile: Profile, remembered?: string | null): Promise<WorkspaceContext> {
  const [business, membership] = await Promise.all([
    getBusinessAccess(supabase, profile),
    supabase.from('subsystem_members').select('subsystem_id, is_lead').eq('user_id', profile.id),
  ])
  const memberships = membership.error ? [] : ((membership.data ?? []) as { subsystem_id: string; is_lead: boolean }[])
  const facts: WorkspaceFacts = {
    role: profile.role,
    isSubsystemMember: memberships.length > 0,
    canViewBusiness: business.canView,
    isBusinessMember: business.isMember,
    canManageOperations: canManageOperations(profile),
  }
  const available = getAvailableWorkspaces(facts)
  const navLevel = getNavLevel({ role: profile.role, isSubsystemLead: memberships.some((m) => m.is_lead) })
  return { facts, available, start: getStartWorkspace(facts, available, remembered), navLevel }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { isCoo, isCtoOrAdmin } from '@/lib/permissions/roles'
import type { BusinessMember } from '@/types/database'
import type { Profile } from '@/types/user'

export type BusinessResponsibility = 'sponsorship_lead'

export interface BusinessAccess {
  // on the Business team (the only way to get Business WRITE permissions)
  isMember: boolean
  isLead: boolean
  responsibilities: BusinessResponsibility[]
  // see the Business area: members, the COO (read-only) and cto/admin
  canView: boolean
  // add/remove members and appoint responsibilities: the Business Lead and cto/admin
  canManageTeam: boolean
  // change who is a Business Lead: cto/admin only
  canManageLeads: boolean
}

// The database (migration 0033) is the real gate; this mirrors it so the UI shows the right things.
// If the Business tables are not there (yet) or the lookup fails, nobody is treated as a member and only
// cto/admin/COO keep the read-only view their role already implies.
export async function getBusinessAccess(supabase: SupabaseClient, profile: Pick<Profile, 'id' | 'role'>): Promise<BusinessAccess> {
  const admin = isCtoOrAdmin(profile)
  const base: BusinessAccess = {
    isMember: false,
    isLead: false,
    responsibilities: [],
    canView: admin || isCoo(profile),
    canManageTeam: admin,
    canManageLeads: admin,
  }

  const { data, error } = await supabase
    .from('business_members')
    .select('user_id, is_lead, responsibilities:business_responsibilities(responsibility)')
    .eq('user_id', profile.id)
    .maybeSingle()
  if (error || !data) return base

  const row = data as unknown as { is_lead: boolean; responsibilities: { responsibility: BusinessResponsibility }[] | null }
  return {
    isMember: true,
    isLead: row.is_lead,
    responsibilities: (row.responsibilities ?? []).map((r) => r.responsibility),
    canView: true,
    canManageTeam: admin || row.is_lead,
    canManageLeads: admin,
  }
}

export async function listBusinessMembers(supabase: SupabaseClient): Promise<BusinessMember[]> {
  const { data, error } = await supabase
    .from('business_members')
    .select(
      '*, profile:profiles!business_members_user_id_fkey(id, display_name, email, avatar_url, role), responsibilities:business_responsibilities(responsibility)'
    )
    .order('is_lead', { ascending: false })
    .order('added_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as BusinessMember[]
}

// Approved, active accounts that are not on the Business team yet. Anyone can be added — including people who are
// also on an engineering subsystem — so this is deliberately not limited to "unassigned" people.
export async function listBusinessCandidates(supabase: SupabaseClient, excludeIds: string[]) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, email, year')
    .eq('approved', true)
    .eq('active', true)
    .order('display_name')
  if (error) throw error
  const skip = new Set(excludeIds)
  return ((data ?? []) as { id: string; display_name: string | null; email: string | null; year: string | null }[]).filter((p) => !skip.has(p.id))
}

export async function addBusinessMember(supabase: SupabaseClient, userId: string) {
  const { error } = await supabase.from('business_members').insert({ user_id: userId, is_lead: false })
  if (error) throw error
}

// RLS decides who may delete; a blocked delete is a silent zero-row result, so ask for the row back.
export async function removeBusinessMember(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from('business_members').delete().eq('user_id', userId).select('user_id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('This member could not be removed. You may not have permission.')
}

export async function setBusinessLead(supabase: SupabaseClient, userId: string, isLead: boolean) {
  const { data, error } = await supabase.from('business_members').update({ is_lead: isLead }).eq('user_id', userId).select('user_id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Only an admin or the CTO can change who is a Business Lead.')
}

export async function setBusinessResponsibility(supabase: SupabaseClient, userId: string, responsibility: BusinessResponsibility, on: boolean) {
  if (on) {
    const { error } = await supabase.from('business_responsibilities').insert({ user_id: userId, responsibility })
    if (error) throw error
    return
  }
  const { data, error } = await supabase
    .from('business_responsibilities')
    .delete()
    .eq('user_id', userId)
    .eq('responsibility', responsibility)
    .select('user_id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('This could not be removed. You may not have permission.')
}

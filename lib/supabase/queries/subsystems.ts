import type { SupabaseClient } from '@supabase/supabase-js'
import type { Subsystem, SubsystemCategory, SubsystemMember } from '@/types/database'
import type { Profile } from '@/types/user'

export async function listSubsystems(supabase: SupabaseClient): Promise<Subsystem[]> {
  const { data, error } = await supabase.from('subsystems').select('*').eq('active', true).order('name')
  if (error) throw error
  return (data ?? []) as Subsystem[]
}

export async function getSubsystemById(supabase: SupabaseClient, id: string): Promise<Subsystem | null> {
  const { data, error } = await supabase.from('subsystems').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as Subsystem | null
}

export async function listSubsystemCategories(supabase: SupabaseClient, subsystemId: string): Promise<SubsystemCategory[]> {
  const { data, error } = await supabase
    .from('subsystem_categories')
    .select('*')
    .eq('subsystem_id', subsystemId)
    .eq('active', true)
    .order('name')
  if (error) throw error
  return (data ?? []) as SubsystemCategory[]
}

export async function listSubsystemMembers(supabase: SupabaseClient, subsystemId: string): Promise<SubsystemMember[]> {
  const { data, error } = await supabase
    .from('subsystem_members')
    .select('*, profile:profiles(id, display_name, email, avatar_url, role)')
    .eq('subsystem_id', subsystemId)
    .order('is_lead', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as SubsystemMember[]
}

export async function listMySubsystems(supabase: SupabaseClient, userId: string): Promise<SubsystemMember[]> {
  const { data, error } = await supabase
    .from('subsystem_members')
    .select('*, subsystem:subsystems(id, name, active)')
    .eq('user_id', userId)
  if (error) throw error
  return (data ?? []) as unknown as SubsystemMember[]
}

export async function listAllSubsystems(supabase: SupabaseClient): Promise<Subsystem[]> {
  const { data, error } = await supabase.from('subsystems').select('*').order('name')
  if (error) throw error
  return (data ?? []) as Subsystem[]
}

export async function createSubsystem(
  supabase: SupabaseClient,
  input: { id: string; name: string; description?: string | null }
) {
  const { data, error } = await supabase.from('subsystems').insert(input).select().single()
  if (error) throw error
  return data as unknown as Subsystem
}

export async function updateSubsystem(supabase: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { data, error } = await supabase.from('subsystems').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as unknown as Subsystem
}

export async function listAllSubsystemCategories(supabase: SupabaseClient, subsystemId: string): Promise<SubsystemCategory[]> {
  const { data, error } = await supabase
    .from('subsystem_categories')
    .select('*')
    .eq('subsystem_id', subsystemId)
    .order('name')
  if (error) throw error
  return (data ?? []) as SubsystemCategory[]
}

export async function createSubsystemCategory(
  supabase: SupabaseClient,
  input: { subsystem_id: string; name: string; engineering_rule?: string | null }
) {
  const { data, error } = await supabase.from('subsystem_categories').insert(input).select().single()
  if (error) throw error
  return data as unknown as SubsystemCategory
}

export async function updateSubsystemCategory(supabase: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { data, error } = await supabase.from('subsystem_categories').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as unknown as SubsystemCategory
}

// The candidate pool for a team lead's own "add a member" picker (migration 0025): approved,
// active, plain-member/team_lead profiles with no subsystem membership anywhere yet. The id list
// comes from a SECURITY DEFINER function (a lead can't otherwise see org-wide membership to
// compute this); the actual profile data is then read through the normal profiles RLS every
// approved user already has, so nothing beyond what's already visible is exposed.
export async function listUnassignedApprovedProfiles(supabase: SupabaseClient): Promise<Profile[]> {
  const { data: ids, error: idsError } = await supabase.rpc('list_unassigned_approved_profile_ids')
  if (idsError) throw idsError
  const idList = (ids ?? []) as string[]
  if (idList.length === 0) return []
  const { data, error } = await supabase.from('profiles').select('*').in('id', idList)
  if (error) throw error
  return (data ?? []) as Profile[]
}

export async function addSubsystemMember(supabase: SupabaseClient, subsystemId: string, userId: string, isLead = false) {
  const { data, error } = await supabase
    .from('subsystem_members')
    .insert({ subsystem_id: subsystemId, user_id: userId, is_lead: isLead })
    .select('*, profile:profiles(id, display_name, email, avatar_url, role)')
    .single()
  if (error) throw error
  return data as unknown as SubsystemMember
}

export async function setSubsystemMemberLead(supabase: SupabaseClient, subsystemId: string, userId: string, isLead: boolean) {
  const { error } = await supabase
    .from('subsystem_members')
    .update({ is_lead: isLead })
    .eq('subsystem_id', subsystemId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function removeSubsystemMember(supabase: SupabaseClient, subsystemId: string, userId: string) {
  const { error } = await supabase.from('subsystem_members').delete().eq('subsystem_id', subsystemId).eq('user_id', userId)
  if (error) throw error
}

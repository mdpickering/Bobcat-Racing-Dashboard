import type { SupabaseClient } from '@supabase/supabase-js'
import type { Subsystem, SubsystemCategory, SubsystemMember } from '@/types/database'

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

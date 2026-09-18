import type { SupabaseClient } from '@supabase/supabase-js'
import type { CompetitionSettings } from '@/types/database'

export async function listAllCompetitionSettings(supabase: SupabaseClient): Promise<CompetitionSettings[]> {
  const { data, error } = await supabase.from('competition_settings').select('*').order('competition_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as CompetitionSettings[]
}

export async function createCompetitionSettings(
  supabase: SupabaseClient,
  input: {
    season: string
    competition_name?: string | null
    competition_date?: string | null
    build_start?: string | null
    design_freeze?: string | null
    manufacturing_start?: string | null
    testing_start?: string | null
  }
) {
  const { data, error } = await supabase.from('competition_settings').insert(input).select().single()
  if (error) throw error
  return data as unknown as CompetitionSettings
}

export async function updateCompetitionSettings(supabase: SupabaseClient, season: string, patch: Record<string, unknown>) {
  const { data, error } = await supabase.from('competition_settings').update(patch).eq('season', season).select().single()
  if (error) throw error
  return data as unknown as CompetitionSettings
}

export async function getCurrentCompetitionSettings(supabase: SupabaseClient): Promise<CompetitionSettings | null> {
  const { data, error } = await supabase
    .from('competition_settings')
    .select('*')
    .order('competition_date', { ascending: true, nullsFirst: false })
  if (error) throw error
  const rows = (data ?? []) as CompetitionSettings[]
  if (rows.length === 0) return null
  const now = Date.now()
  const upcoming = rows.find((r) => r.competition_date && new Date(r.competition_date).getTime() >= now)
  return upcoming ?? rows[rows.length - 1]
}

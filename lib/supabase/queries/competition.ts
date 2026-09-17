import type { SupabaseClient } from '@supabase/supabase-js'
import type { CompetitionSettings } from '@/types/database'

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

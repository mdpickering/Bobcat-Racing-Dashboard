import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeBomLine, type BomLine } from '@/lib/bom'

// The whole Master BOM is a few hundred lines, so the page reads it in one go and filters in memory (the same
// approach as the parts catalog). Row-level security (migration 0044) lets any approved user read it; nobody can write
// through the API.
const MAX_LINES = 5000

export async function listBomLines(supabase: SupabaseClient): Promise<BomLine[]> {
  const { data, error } = await supabase.from('bom_lines').select('*').order('sort_order', { ascending: true }).limit(MAX_LINES)
  if (error) throw error
  return ((data ?? []) as BomLine[]).map(normalizeBomLine)
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { attachCosts, normalizeBomLine, type BomCostRow, type BomLine, type BomRecordType, type ReviewStatus } from '@/lib/bom'

// The whole Master BOM is a few hundred lines, so the page reads it in one go and filters in memory (the same
// approach as the parts catalog). Row-level security (migrations 0044/0045) lets any approved user read the lines, and
// only Business members and cto/admin read the prices; nobody writes through the API except cto/admin reviewing.
const MAX_LINES = 5000

/**
 * Every line, with prices merged in when `withCosts` is true. The prices come from their own table whose row-level
 * security only lets Business members and cto/admin read it, so passing `withCosts` as someone else just returns no
 * prices; the caller's decision here only saves a query.
 */
export async function listBomLines(supabase: SupabaseClient, { withCosts }: { withCosts: boolean }): Promise<BomLine[]> {
  const { data, error } = await supabase.from('bom_lines').select('*').order('sort_order', { ascending: true }).limit(MAX_LINES)
  if (error) throw error
  const lines = ((data ?? []) as BomLine[]).map(normalizeBomLine)
  if (!withCosts) return attachCosts(lines, [])

  const { data: costs, error: costError } = await supabase.from('bom_line_costs').select('line_id, unit_cost, total_cost').limit(MAX_LINES)
  if (costError) throw costError
  return attachCosts(lines, (costs ?? []) as BomCostRow[])
}

export interface BomReviewPatch {
  review_status?: ReviewStatus
  review_note?: string | null
  subsystem?: string
  season?: string
  vendor?: string | null
  part_number?: string | null
  record_type?: BomRecordType
}

/** Review / correct one line (cto/admin only; the database refuses anyone else and stamps who reviewed and when). */
export async function updateBomLine(supabase: SupabaseClient, id: string, patch: BomReviewPatch): Promise<void> {
  const { data, error } = await supabase.from('bom_lines').update(patch).eq('id', id).select('id')
  if (error) throw error
  // row-level security quietly matches zero rows for someone who is not allowed; that must not look like success
  if (!data || data.length === 0) throw new Error('That line could not be updated. Only the CTO or an admin can review the BOM.')
}

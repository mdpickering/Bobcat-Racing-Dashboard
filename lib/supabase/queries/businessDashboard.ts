import type { SupabaseClient } from '@supabase/supabase-js'
import { listPurchaseRequests } from '@/lib/supabase/queries/purchasing'
import { summarizePurchasing, type PurchasingOverview } from '@/lib/purchasingSummary'
import { listSponsorshipLevels, listSponsorshipRows, type SponsorshipListRow } from '@/lib/supabase/queries/sponsorships'
import { isDeadlineDueSoon, isDeadlineOverdue } from '@/lib/deadline'
import type { SponsorshipLevel } from '@/types/database'

// Everything on the Business dashboard is read from data that already exists (the sponsorship views from migration
// 0034, purchase requests, tasks). Nothing here is estimated; Budget, Inventory and Reports have no data yet and are
// deliberately absent.

export interface SponsorshipOverview {
  season: string
  levels: SponsorshipLevel[]
  rows: SponsorshipListRow[]
  committed: SponsorshipListRow[]
  totalValue: number
  cashCommitted: number
  cashReceived: number
  cashOutstanding: number
  inKindValue: number
  needsReview: number
  // committed sponsorships by level, in program order; sponsorships without a level are counted separately
  byLevel: { name: string; count: number }[]
  unassigned: number
}

export async function getSponsorshipOverview(supabase: SupabaseClient, season: string): Promise<SponsorshipOverview> {
  const [levels, rows] = await Promise.all([listSponsorshipLevels(supabase, season), listSponsorshipRows(supabase, season)])
  const committed = rows.filter((r) => r.stage === 'committed')
  const sum = (pick: (r: SponsorshipListRow) => number) => committed.reduce((a, r) => a + pick(r), 0)
  const byLevel = levels
    .map((l) => ({ name: l.name, count: committed.filter((r) => r.level_id === l.id).length }))
    .filter((l) => l.count > 0)
  return {
    season,
    levels,
    rows,
    committed,
    totalValue: sum((r) => r.total_sponsorship_value),
    cashCommitted: sum((r) => r.cash_committed),
    cashReceived: sum((r) => r.cash_received),
    cashOutstanding: sum((r) => r.cash_outstanding),
    inKindValue: sum((r) => r.in_kind_value),
    needsReview: rows.filter((r) => r.review && ['qualifies_higher', 'below_minimum'].includes(r.review.review_flag)).length,
    byLevel,
    unassigned: committed.filter((r) => !r.level_id).length,
  }
}

export interface EngineeringSnapshot {
  open: number
  overdue: number
  dueSoon: number
}

// Counts of the tasks this person is allowed to see (Row Level Security decides which those are).
export async function getEngineeringSnapshot(supabase: SupabaseClient): Promise<EngineeringSnapshot> {
  const { data, error } = await supabase.from('tasks').select('status, deadline')
  if (error) throw error
  const open = ((data ?? []) as { status: string; deadline: string | null }[]).filter((t) => t.status !== 'Complete')
  return {
    open: open.length,
    overdue: open.filter((t) => isDeadlineOverdue(t.deadline, t.status)).length,
    dueSoon: open.filter((t) => isDeadlineDueSoon(t.deadline, t.status, 7)).length,
  }
}

export type { PurchasingOverview }

export async function getPurchasingOverview(supabase: SupabaseClient): Promise<PurchasingOverview> {
  return summarizePurchasing(await listPurchaseRequests(supabase))
}

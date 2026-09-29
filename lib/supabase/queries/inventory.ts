import type { SupabaseClient } from '@supabase/supabase-js'
import { canManageInventory } from '@/lib/permissions/roles'
import type {
  InventoryByLocationRow,
  InventoryLocation,
  InventoryOverviewRow,
  InventoryTransaction,
  PurchaseReceivingStatusRow,
  PurchaseRequestReceivingRow,
} from '@/types/database'
import type { Profile } from '@/types/user'

const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))
const num = (v: unknown): number => Number(v ?? 0)

// ---------------------------------------------------------
// Access. Mirrors the 0038 permission model exactly:
//   read            any approved, active user (public.is_approved())
//   receive/adjust  the COO/cto/admin for anything, or a team lead for their own subsystem's parts/requests
//   reversal        cto/admin only
//   locations / opening balance   the COO/cto/admin (public.can_manage_inventory())
// The database is the real gate; this only decides which controls to show.
// ---------------------------------------------------------
export interface InventoryAccess {
  // the COO, CTO or admin: opening balances, locations, and receive/adjust/transfer for ANY subsystem
  canManageLocations: boolean
  // reversing a receipt: cto/admin only, narrower than the above (the COO cannot)
  canReverse: boolean
  ledSubsystemIds: string[]
  canReceiveSubsystem: (subsystemId: string) => boolean
  canAdjustSubsystem: (subsystemId: string) => boolean
}

export async function getInventoryAccess(supabase: SupabaseClient, profile: Pick<Profile, 'id' | 'role'>): Promise<InventoryAccess> {
  const manageAny = canManageInventory(profile)
  const { data } = await supabase.from('subsystem_members').select('subsystem_id').eq('user_id', profile.id).eq('is_lead', true)
  const ledSubsystemIds = (data ?? []).map((r) => (r as { subsystem_id: string }).subsystem_id)
  const ledSet = new Set(ledSubsystemIds)
  return {
    canManageLocations: manageAny,
    canReverse: profile.role === 'cto' || profile.role === 'admin',
    ledSubsystemIds,
    canReceiveSubsystem: (id) => manageAny || ledSet.has(id),
    canAdjustSubsystem: (id) => manageAny || ledSet.has(id),
  }
}

// ---------------------------------------------------------
// Locations
// ---------------------------------------------------------
export async function listLocations(supabase: SupabaseClient): Promise<InventoryLocation[]> {
  const { data, error } = await supabase.from('inventory_locations').select('*').order('sort_order', { ascending: true }).order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as InventoryLocation[]
}

export async function listActiveLocations(supabase: SupabaseClient): Promise<Pick<InventoryLocation, 'id' | 'name'>[]> {
  const { data, error } = await supabase.from('inventory_locations').select('id, name').eq('active', true).order('sort_order', { ascending: true }).order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Pick<InventoryLocation, 'id' | 'name'>[]
}

const LOCATION_NO_PERMISSION = 'That change was not saved. Only the COO, CTO or an admin manages locations.'

function friendlyLocation(error: unknown, fallback: string): never {
  const code = (error as { code?: string })?.code
  const message = (error as { message?: string })?.message ?? ''
  if (code === '23505') throw new Error('A location with that name already exists (names are compared ignoring case, spaces and punctuation).')
  if (code === '23514') throw new Error(message || fallback)
  if (code === '42501') throw new Error(LOCATION_NO_PERMISSION)
  throw error instanceof Error ? error : new Error(fallback)
}

export async function createLocation(supabase: SupabaseClient, input: { name: string; description: string | null; sort_order?: number }): Promise<string> {
  const { data, error } = await supabase.from('inventory_locations').insert(input).select('id').single()
  if (error) friendlyLocation(error, 'Could not create the location.')
  return (data as { id: string }).id
}

export async function updateLocation(supabase: SupabaseClient, id: string, patch: Partial<{ name: string; description: string | null; sort_order: number; active: boolean }>) {
  const { data, error } = await supabase.from('inventory_locations').update(patch).eq('id', id).select('id')
  if (error) friendlyLocation(error, 'Could not save the location.')
  if (!data || data.length === 0) throw new Error(LOCATION_NO_PERMISSION)
}

// ---------------------------------------------------------
// Reads: overview, by-location, receiving
// ---------------------------------------------------------
function normalizeOverview(row: InventoryOverviewRow): InventoryOverviewRow {
  return { ...row, effective_unit_cost: numOrNull(row.effective_unit_cost), stock_value: numOrNull(row.stock_value), on_hand: num(row.on_hand), location_count: num(row.location_count), on_order: num(row.on_order) }
}

export async function listInventoryOverview(supabase: SupabaseClient): Promise<InventoryOverviewRow[]> {
  const { data, error } = await supabase.from('inventory_overview').select('*').order('part_number', { ascending: true }).limit(5000)
  if (error) throw error
  return ((data ?? []) as InventoryOverviewRow[]).map(normalizeOverview)
}

export async function getInventoryOverviewForPart(supabase: SupabaseClient, partId: string): Promise<InventoryOverviewRow | null> {
  const { data, error } = await supabase.from('inventory_overview').select('*').eq('part_id', partId).maybeSingle()
  if (error) throw error
  return data ? normalizeOverview(data as InventoryOverviewRow) : null
}

export async function listInventoryByLocationForPart(supabase: SupabaseClient, partId: string): Promise<InventoryByLocationRow[]> {
  const { data, error } = await supabase.from('inventory_by_location').select('*').eq('part_id', partId).order('location_name', { ascending: true })
  if (error) throw error
  return ((data ?? []) as InventoryByLocationRow[]).map((r) => ({ ...r, quantity_on_hand: num(r.quantity_on_hand) }))
}

function normalizeReceiving(row: PurchaseReceivingStatusRow): PurchaseReceivingStatusRow {
  return { ...row, ordered_quantity: num(row.ordered_quantity), accepted_quantity: num(row.accepted_quantity), rejected_quantity: num(row.rejected_quantity), outstanding_quantity: num(row.outstanding_quantity) }
}

// The whole receiving picture: every purchase line that has ever been ordered. Callers slice this into "needs
// receiving" (receivable && outstanding > 0) and "recently received" (accepted_quantity > 0) themselves, so
// there is one read and one source of truth for both.
export async function listReceivingStatus(supabase: SupabaseClient): Promise<PurchaseReceivingStatusRow[]> {
  const { data, error } = await supabase.from('purchase_receiving_status').select('*').order('request_title', { ascending: true }).limit(5000)
  if (error) throw error
  return ((data ?? []) as PurchaseReceivingStatusRow[]).map(normalizeReceiving)
}

export async function listReceivingStatusForRequest(supabase: SupabaseClient, purchaseRequestId: string): Promise<PurchaseReceivingStatusRow[]> {
  const { data, error } = await supabase.from('purchase_receiving_status').select('*').eq('purchase_request_id', purchaseRequestId).order('description', { ascending: true })
  if (error) throw error
  return ((data ?? []) as PurchaseReceivingStatusRow[]).map(normalizeReceiving)
}

export async function getRequestReceivingSummary(supabase: SupabaseClient, purchaseRequestId: string): Promise<PurchaseRequestReceivingRow | null> {
  const { data, error } = await supabase.from('purchase_request_receiving').select('*').eq('purchase_request_id', purchaseRequestId).maybeSingle()
  if (error) throw error
  if (!data) return null
  const r = data as PurchaseRequestReceivingRow
  return { ...r, line_count: num(r.line_count), ordered_total: num(r.ordered_total), accepted_total: num(r.accepted_total), rejected_total: num(r.rejected_total), outstanding_total: num(r.outstanding_total), lines_fully_received: num(r.lines_fully_received) }
}

// Recent history for one part, across every location, newest first. Used on Part Detail's Stock panel.
export async function listRecentTransactionsForPart(supabase: SupabaseClient, partId: string, limit = 10): Promise<InventoryTransaction[]> {
  const { data, error } = await supabase
    .from('inventory_transactions')
    .select('*, location:inventory_locations(id, name), actor:profiles(id, display_name, email)')
    .eq('part_id', partId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as unknown as InventoryTransaction[]
}

// ---------------------------------------------------------
// Writes: the SECURITY DEFINER functions from 0038 are the only path. Every error message the database raises is
// already plain language (permission, quantity bounds, missing reason, missing location) — never a raw Postgres
// error — so it is safe to surface as-is, the same trust relationship the rest of the app has with its RPCs.
// ---------------------------------------------------------
export interface ReceiveLineInput {
  item_id: string
  received: number
  rejected: number
  rejected_reason: string | null
  part_id: string | null
  location_id: string | null
  notes: string | null
}

export async function receivePurchaseItems(
  supabase: SupabaseClient,
  input: { purchase_request_id: string; received_on: string; notes: string | null; client_token: string; lines: ReceiveLineInput[] }
): Promise<string> {
  const { data, error } = await supabase.rpc('receive_purchase_items', {
    p_request_id: input.purchase_request_id,
    p_received_on: input.received_on,
    p_notes: input.notes,
    p_client_token: input.client_token,
    p_lines: input.lines,
  })
  if (error) throw error
  return data as string
}

export async function reverseReceiptLine(supabase: SupabaseClient, lineId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('reverse_purchase_receipt_line', { p_line_id: lineId, p_reason: reason })
  if (error) throw error
}

export async function adjustInventory(supabase: SupabaseClient, input: { part_id: string; location_id: string; delta: number; reason: string; notes: string | null }): Promise<void> {
  const { error } = await supabase.rpc('adjust_inventory', { p_part_id: input.part_id, p_location_id: input.location_id, p_delta: input.delta, p_reason: input.reason, p_notes: input.notes })
  if (error) throw error
}

export async function writeOffInventory(supabase: SupabaseClient, input: { part_id: string; location_id: string; quantity: number; reason: string; notes: string | null }): Promise<void> {
  const { error } = await supabase.rpc('write_off_inventory', { p_part_id: input.part_id, p_location_id: input.location_id, p_quantity: input.quantity, p_reason: input.reason, p_notes: input.notes })
  if (error) throw error
}

export async function transferInventory(supabase: SupabaseClient, input: { part_id: string; from_location_id: string; to_location_id: string; quantity: number; notes: string | null }): Promise<void> {
  const { error } = await supabase.rpc('transfer_inventory', { p_part_id: input.part_id, p_from_location_id: input.from_location_id, p_to_location_id: input.to_location_id, p_quantity: input.quantity, p_notes: input.notes })
  if (error) throw error
}

export async function recordOpeningBalance(supabase: SupabaseClient, input: { part_id: string; location_id: string; quantity: number; reason: string; notes: string | null }): Promise<void> {
  const { error } = await supabase.rpc('record_opening_balance', { p_part_id: input.part_id, p_location_id: input.location_id, p_quantity: input.quantity, p_reason: input.reason, p_notes: input.notes })
  if (error) throw error
}

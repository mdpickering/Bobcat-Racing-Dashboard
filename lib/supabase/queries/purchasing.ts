import type { SupabaseClient } from '@supabase/supabase-js'
import type { PurchaseRequest, PurchaseRequestItem, PurchaseStatusHistory } from '@/types/database'

// purchase_requests has two FK paths to profiles (requested_by, reviewed_by),
// so both embeds need the FK hint to disambiguate — same PGRST201 class of
// issue as task_comments/task_requests.
const PURCHASE_REQUEST_SELECT = `
  *,
  subsystem:subsystems(id, name),
  requester:profiles!purchase_requests_requested_by_fkey(id, display_name, email),
  reviewer:profiles!purchase_requests_reviewed_by_fkey(id, display_name, email)
`

export interface PurchaseRequestFilters {
  subsystemId?: string
  status?: string
}

export async function listPurchaseRequests(supabase: SupabaseClient, filters: PurchaseRequestFilters = {}): Promise<PurchaseRequest[]> {
  let query = supabase.from('purchase_requests').select(PURCHASE_REQUEST_SELECT).order('created_at', { ascending: false })
  if (filters.subsystemId) query = query.eq('subsystem_id', filters.subsystemId)
  if (filters.status) query = query.eq('status', filters.status)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as PurchaseRequest[]
}

export async function getPurchaseRequestById(supabase: SupabaseClient, id: string): Promise<PurchaseRequest | null> {
  const { data, error } = await supabase.from('purchase_requests').select(PURCHASE_REQUEST_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  return data as unknown as PurchaseRequest | null
}

export async function createPurchaseRequest(
  supabase: SupabaseClient,
  input: { subsystem_id: string; title: string; description?: string | null; vendor?: string | null }
) {
  const { data, error } = await supabase.from('purchase_requests').insert(input).select(PURCHASE_REQUEST_SELECT).single()
  if (error) throw error
  return data as unknown as PurchaseRequest
}

export async function updatePurchaseRequest(supabase: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { data, error } = await supabase.from('purchase_requests').update(patch).eq('id', id).select(PURCHASE_REQUEST_SELECT).single()
  if (error) throw error
  return data as unknown as PurchaseRequest
}

export async function listPurchaseRequestItems(supabase: SupabaseClient, purchaseRequestId: string): Promise<PurchaseRequestItem[]> {
  const { data, error } = await supabase
    .from('purchase_request_items')
    .select('*')
    .eq('purchase_request_id', purchaseRequestId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as PurchaseRequestItem[]
}

export async function addPurchaseRequestItem(
  supabase: SupabaseClient,
  input: { purchase_request_id: string; description: string; quantity: number; unit_cost?: number | null; link?: string | null; notes?: string | null }
) {
  const { data, error } = await supabase.from('purchase_request_items').insert(input).select().single()
  if (error) throw error
  return data as unknown as PurchaseRequestItem
}

export async function updatePurchaseRequestItem(supabase: SupabaseClient, itemId: string, patch: Record<string, unknown>) {
  const { data, error } = await supabase.from('purchase_request_items').update(patch).eq('id', itemId).select().single()
  if (error) throw error
  return data as unknown as PurchaseRequestItem
}

export async function deletePurchaseRequestItem(supabase: SupabaseClient, itemId: string) {
  const { error } = await supabase.from('purchase_request_items').delete().eq('id', itemId)
  if (error) throw error
}

export async function listPurchaseStatusHistory(supabase: SupabaseClient, purchaseRequestId: string): Promise<PurchaseStatusHistory[]> {
  const { data, error } = await supabase
    .from('purchase_status_history')
    .select('*, changed_by_profile:profiles(id, display_name, email)')
    .eq('purchase_request_id', purchaseRequestId)
    .order('changed_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as PurchaseStatusHistory[]
}

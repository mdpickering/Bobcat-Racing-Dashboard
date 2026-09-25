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

// A purchase request must carry a valid product link (the existing purchase_request_items.link
// field). create_purchase_request inserts the request and its first line item in one
// transaction, and the database rejects a request that would be left without a linked item
// (migration 0022) — so a bare insert into purchase_requests no longer succeeds.
export async function createPurchaseRequest(
  supabase: SupabaseClient,
  input: {
    subsystem_id: string
    title: string
    description?: string | null
    vendor?: string | null
    product_url: string
    part_number?: string | null
    subassembly?: string | null
  }
): Promise<string> {
  const { data, error } = await supabase.rpc('create_purchase_request', {
    p_subsystem_id: input.subsystem_id,
    p_title: input.title,
    p_description: input.description ?? null,
    p_vendor: input.vendor ?? null,
    p_product_url: input.product_url,
    p_part_number: input.part_number?.trim() || null,
    p_subassembly: input.subassembly?.trim() || null,
  })
  if (error) throw error
  return data as string
}

// RLS decides who may delete (cto/admin, or the creator while still a Draft); a blocked delete
// is a silent zero-row result, so ask for the deleted row back and treat "nothing deleted" as an error.
export async function deletePurchaseRequest(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from('purchase_requests').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('This purchase request could not be deleted. You may not have permission, or it no longer exists.')
  }
}

export async function updatePurchaseRequest(supabase: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { data, error } = await supabase.from('purchase_requests').update(patch).eq('id', id).select(PURCHASE_REQUEST_SELECT).single()
  if (error) throw error
  return data as unknown as PurchaseRequest
}

// Approval is an explicit action, not a status edit (migration 0027): the database refuses any
// direct change of status to 'Approved' and only accepts it from this RPC, which also checks that
// the caller is cto/admin and that the request is Submitted or Under Review. reviewed_by /
// reviewed_at are stamped by the database, never sent from here.
export async function approvePurchaseRequest(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.rpc('approve_purchase_request', { p_request_id: id })
  if (error) throw error
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
  input: {
    purchase_request_id: string
    description: string
    quantity: number
    unit_cost?: number | null
    link: string
    notes?: string | null
    part_number?: string | null
    subassembly?: string | null
  }
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

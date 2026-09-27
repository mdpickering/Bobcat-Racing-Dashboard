import type { SupabaseClient } from '@supabase/supabase-js'
import { getBusinessAccess } from '@/lib/supabase/queries/business'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import type { PartVendorLink, Vendor, VendorOverview } from '@/types/database'
import type { Profile } from '@/types/user'

const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

// ---------------------------------------------------------
// Access. Mirrors public.can_manage_vendors() (migration 0037): any active Business member (the Business Lead
// included) and cto/admin. A team lead, as such, does not; the COO does not unless also on the Business team. The
// database is the real gate; this only decides which controls to show.
// ---------------------------------------------------------
export interface VendorAccess {
  canView: boolean
  canManage: boolean
}

export async function getVendorAccess(supabase: SupabaseClient, profile: Pick<Profile, 'id' | 'role'>): Promise<VendorAccess> {
  const business = await getBusinessAccess(supabase, profile)
  return { canView: business.canView, canManage: isCtoOrAdmin(profile) || business.isMember }
}

function normalize(row: VendorOverview): VendorOverview {
  return { ...row, part_count: Number(row.part_count ?? 0), purchase_items: Number(row.purchase_items ?? 0), purchase_total: Number(row.purchase_total ?? 0) }
}

export async function listVendorsOverview(supabase: SupabaseClient): Promise<VendorOverview[]> {
  const { data, error } = await supabase.from('vendors_overview').select('*').order('name', { ascending: true }).limit(5000)
  if (error) throw error
  return ((data ?? []) as VendorOverview[]).map(normalize)
}

export async function getVendorOverview(supabase: SupabaseClient, id: string): Promise<VendorOverview | null> {
  const { data, error } = await supabase.from('vendors_overview').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? normalize(data as VendorOverview) : null
}

// The parts this vendor sells, with the vendor-specific part number, price and product link.
export async function listVendorParts(supabase: SupabaseClient, vendorId: string): Promise<PartVendorLink[]> {
  const { data, error } = await supabase
    .from('part_vendors')
    .select('*, part:parts(id, part_number, name, active, subsystem_id)')
    .eq('vendor_id', vendorId)
  if (error) throw error
  return ((data ?? []) as unknown as PartVendorLink[])
    .map((l) => ({ ...l, unit_cost: numOrNull(l.unit_cost) }))
    .sort((a, b) => (a.part?.part_number ?? '').localeCompare(b.part?.part_number ?? ''))
}

export interface VendorPurchaseLine {
  id: string
  description: string
  quantity: number
  unit_cost: number | null
  request: { id: string; title: string; status: string; created_at: string } | null
}

// Real purchasing activity only: lines that were LINKED to this vendor (vendor_id) through the catalog picker.
// Free-text vendor names on older lines are never guessed at.
export async function listVendorPurchaseLines(supabase: SupabaseClient, vendorId: string): Promise<VendorPurchaseLine[]> {
  const { data, error } = await supabase
    .from('purchase_request_items')
    .select('id, description, quantity, unit_cost, request:purchase_requests(id, title, status, created_at)')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return ((data ?? []) as unknown as VendorPurchaseLine[]).map((l) => ({ ...l, unit_cost: numOrNull(l.unit_cost) }))
}

// ---------------------------------------------------------
// Writes
// ---------------------------------------------------------
const NO_PERMISSION = 'That change was not saved. You may not have permission.'

export interface VendorInput {
  name: string
  website: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string | null
  notes: string | null
}

function friendly(error: unknown, fallback: string): never {
  const code = (error as { code?: string })?.code
  const message = (error as { message?: string })?.message ?? ''
  if (code === '23505') throw new Error('A vendor with that name already exists (names are compared ignoring case, spaces and punctuation).')
  if (code === '23514') throw new Error(message || fallback)
  if (code === '42501') throw new Error(NO_PERMISSION)
  throw error instanceof Error ? error : new Error(fallback)
}

export async function createVendor(supabase: SupabaseClient, input: VendorInput): Promise<string> {
  const { data, error } = await supabase.from('vendors').insert(input).select('id').single()
  if (error) friendly(error, 'Could not create the vendor.')
  return (data as { id: string }).id
}

export async function updateVendor(supabase: SupabaseClient, id: string, patch: Partial<VendorInput> & { active?: boolean }) {
  const { data, error } = await supabase.from('vendors').update(patch).eq('id', id).select('id')
  if (error) friendly(error, 'Could not save the vendor.')
  if (!data || data.length === 0) throw new Error(NO_PERMISSION)
}

export type { Vendor }

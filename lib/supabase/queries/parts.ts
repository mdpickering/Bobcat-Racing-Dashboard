import type { SupabaseClient } from '@supabase/supabase-js'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import type { PartCatalogRow, PartVendorLink, Vendor } from '@/types/database'
import type { Profile } from '@/types/user'

const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

// ---------------------------------------------------------
// Access. Mirrors public.can_manage_part() (migration 0037): cto/admin manage every part, a subsystem lead manages the
// parts of the subsystem(s) they lead. The database is the real gate; this only decides which buttons to show.
// ---------------------------------------------------------
export interface PartsAccess {
  canManageAll: boolean
  ledSubsystemIds: string[]
  canManageAny: boolean
  canManageSubsystem: (subsystemId: string) => boolean
}

export async function getPartsAccess(supabase: SupabaseClient, profile: Pick<Profile, 'id' | 'role'>): Promise<PartsAccess> {
  const canManageAll = isCtoOrAdmin(profile)
  const { data } = await supabase.from('subsystem_members').select('subsystem_id').eq('user_id', profile.id).eq('is_lead', true)
  const ledSubsystemIds = (data ?? []).map((r) => (r as { subsystem_id: string }).subsystem_id)
  return {
    canManageAll,
    ledSubsystemIds,
    canManageAny: canManageAll || ledSubsystemIds.length > 0,
    canManageSubsystem: (id) => canManageAll || ledSubsystemIds.includes(id),
  }
}

// ---------------------------------------------------------
// Reads
// ---------------------------------------------------------
function normalizePart(row: PartCatalogRow): PartCatalogRow {
  return {
    ...row,
    unit_cost: numOrNull(row.unit_cost),
    preferred_vendor_cost: numOrNull(row.preferred_vendor_cost),
    effective_unit_cost: numOrNull(row.effective_unit_cost),
    vendor_count: Number(row.vendor_count ?? 0),
  }
}

export async function listPartsCatalog(supabase: SupabaseClient): Promise<PartCatalogRow[]> {
  const { data, error } = await supabase.from('parts_catalog').select('*').order('part_number', { ascending: true }).limit(5000)
  if (error) throw error
  return ((data ?? []) as PartCatalogRow[]).map(normalizePart)
}

export async function getPartCatalogRow(supabase: SupabaseClient, id: string): Promise<PartCatalogRow | null> {
  const { data, error } = await supabase.from('parts_catalog').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? normalizePart(data as PartCatalogRow) : null
}

export async function listPartVendors(supabase: SupabaseClient, partId: string): Promise<PartVendorLink[]> {
  const { data, error } = await supabase
    .from('part_vendors')
    .select('*, vendor:vendors(id, name, website, active)')
    .eq('part_id', partId)
    .order('is_preferred', { ascending: false })
  if (error) throw error
  return ((data ?? []) as unknown as PartVendorLink[])
    .map((l) => ({ ...l, unit_cost: numOrNull(l.unit_cost) }))
    .sort((a, b) => Number(b.is_preferred) - Number(a.is_preferred) || (a.vendor?.name ?? '').localeCompare(b.vendor?.name ?? ''))
}

export interface PartPurchaseLine {
  id: string
  description: string
  quantity: number
  unit_cost: number | null
  vendor: string | null
  request: { id: string; title: string; status: string; created_at: string } | null
}

// Real purchasing activity only: lines that were LINKED to this part (part_id) through the catalog picker.
export async function listPartPurchaseLines(supabase: SupabaseClient, partId: string): Promise<PartPurchaseLine[]> {
  const { data, error } = await supabase
    .from('purchase_request_items')
    .select('id, description, quantity, unit_cost, vendor, request:purchase_requests(id, title, status, created_at)')
    .eq('part_id', partId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return ((data ?? []) as unknown as PartPurchaseLine[]).map((l) => ({ ...l, unit_cost: numOrNull(l.unit_cost) }))
}

export interface CatalogAuditEntry {
  id: string
  action: string
  entity_type: string
  entity_id: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  created_at: string
  actor?: { id: string; display_name: string | null; email: string | null } | null
}

// The audit_logs rows the catalog triggers wrote for one part (its own changes and its vendor links) or one vendor.
// Only cto/admin can read audit_logs (migration 0011); anyone else simply gets an empty list.
export async function listCatalogAudit(supabase: SupabaseClient, entityTypes: string[], entityId: string, limit = 20): Promise<CatalogAuditEntry[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, action, entity_type, entity_id, before, after, created_at, actor:profiles(id, display_name, email)')
    .in('entity_type', entityTypes)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as unknown as CatalogAuditEntry[]
}

// Every link in the catalog (for the vendor filter): which vendors sell which parts.
export async function listAllPartVendorPairs(supabase: SupabaseClient): Promise<{ part_id: string; vendor_id: string; vendor_name: string | null }[]> {
  const { data, error } = await supabase.from('part_vendors').select('part_id, vendor_id, vendor:vendors(name)').limit(20000)
  if (error) throw error
  return ((data ?? []) as unknown as { part_id: string; vendor_id: string; vendor: { name: string } | null }[]).map((r) => ({ part_id: r.part_id, vendor_id: r.vendor_id, vendor_name: r.vendor?.name ?? null }))
}

// Active vendors for the "link a vendor" / purchasing pickers.
export async function listActiveVendors(supabase: SupabaseClient): Promise<Pick<Vendor, 'id' | 'name' | 'website'>[]> {
  const { data, error } = await supabase.from('vendors').select('id, name, website').eq('active', true).order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Pick<Vendor, 'id' | 'name' | 'website'>[]
}

// ---------------------------------------------------------
// Writes. RLS + the 0037 triggers decide what is allowed; a blocked update is a silent zero-row result, so those ask
// for the row back and report it.
// ---------------------------------------------------------
const NO_PERMISSION = 'That change was not saved. You may not have permission.'

export interface PartInput {
  part_number: string
  name: string
  description: string | null
  subsystem_id: string
  category: string | null
  manufacturer: string | null
  manufacturer_part_number: string | null
  unit_cost: number | null
  source_url: string | null
  notes: string | null
}

function friendly(error: unknown, fallback: string): never {
  const code = (error as { code?: string })?.code
  const message = (error as { message?: string })?.message ?? ''
  if (code === '23505') throw new Error(/part_vendors/.test(message) ? 'That vendor is already linked to this part.' : 'A part with that part number already exists.')
  if (code === '23514') throw new Error(message || fallback)
  if (code === '42501') throw new Error(message.includes('move a part') ? 'Only the CTO or an admin can move a part to another subsystem.' : NO_PERMISSION)
  throw error instanceof Error ? error : new Error(fallback)
}

export async function createPart(supabase: SupabaseClient, input: PartInput): Promise<string> {
  const { data, error } = await supabase.from('parts').insert(input).select('id').single()
  if (error) friendly(error, 'Could not create the part.')
  return (data as { id: string }).id
}

export async function updatePart(supabase: SupabaseClient, id: string, patch: Partial<PartInput> & { active?: boolean }) {
  const { data, error } = await supabase.from('parts').update(patch).eq('id', id).select('id')
  if (error) friendly(error, 'Could not save the part.')
  if (!data || data.length === 0) throw new Error(NO_PERMISSION)
}

export interface PartVendorInput {
  vendor_part_number: string | null
  unit_cost: number | null
  product_url: string | null
  is_preferred: boolean
  availability_notes: string | null
  last_verified_on: string | null
}

export async function addPartVendor(supabase: SupabaseClient, partId: string, vendorId: string, input: PartVendorInput) {
  const { error } = await supabase.from('part_vendors').insert({ part_id: partId, vendor_id: vendorId, ...input })
  if (error) friendly(error, 'Could not link the vendor.')
}

export async function updatePartVendor(supabase: SupabaseClient, partId: string, vendorId: string, patch: Partial<PartVendorInput>) {
  const { data, error } = await supabase.from('part_vendors').update(patch).eq('part_id', partId).eq('vendor_id', vendorId).select('part_id')
  if (error) friendly(error, 'Could not save the vendor details.')
  if (!data || data.length === 0) throw new Error(NO_PERMISSION)
}

export async function removePartVendor(supabase: SupabaseClient, partId: string, vendorId: string) {
  const { data, error } = await supabase.from('part_vendors').delete().eq('part_id', partId).eq('vendor_id', vendorId).select('part_id')
  if (error) friendly(error, 'Could not remove the vendor.')
  if (!data || data.length === 0) throw new Error(NO_PERMISSION)
}

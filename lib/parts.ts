import { validateProductUrl } from '@/lib/validation'
import type { PartCatalogRow } from '@/types/database'

// Parts + vendors (migration 0037). The database is the real enforcement of every rule here; this file only gives
// immediate, friendly feedback and shared wording.

export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

// An OPTIONAL http(s) link: blank is fine; anything else must pass the same rule as purchasing's product link
// (which mirrors public.is_valid_http_url()). javascript:, ftp:, data: and bare domains are all refused.
export function validateOptionalUrl(value: string): string | null {
  return value.trim() === '' ? null : validateProductUrl(value)
}

// An optional non-negative money amount typed into a form. Blank -> null.
export function parseOptionalCost(value: string): { value: number | null; error: string | null } {
  const v = value.trim()
  if (v === '') return { value: null, error: null }
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return { value: null, error: 'Enter a cost of $0 or more.' }
  if (n > 99999999.99) return { value: null, error: 'That cost is too large.' }
  return { value: Math.round(n * 100) / 100, error: null }
}

export function validateOptionalEmail(value: string): string | null {
  const v = value.trim()
  if (v === '') return null
  return /^[^@\s]+@[^@\s]+$/.test(v) && v.length <= 254 ? null : 'Enter a valid email address.'
}

export const CATALOG_STATUS_LABEL = { active: 'Active', inactive: 'Inactive' } as const

// Searching parts: part number, name, manufacturer, manufacturer part number, and vendor names, case-insensitive.
export function partMatches(row: Pick<PartCatalogRow, 'part_number' | 'name' | 'manufacturer' | 'manufacturer_part_number' | 'vendor_names' | 'category' | 'description'>, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [row.part_number, row.name, row.manufacturer, row.manufacturer_part_number, row.vendor_names, row.category, row.description].some((f) => (f ?? '').toLowerCase().includes(q))
}

// Searching vendors: name, contact name and contact email.
export function vendorMatches(row: { name: string; contact_name: string | null; contact_email: string | null }, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [row.name, row.contact_name, row.contact_email].some((f) => (f ?? '').toLowerCase().includes(q))
}

// ---------------------------------------------------------
// Purchasing pickers: choosing a catalog part or vendor fills ONLY the blank text fields; whatever the person typed is
// never overwritten. The database does the same when a line is saved (a snapshot of blank fields at link time), so
// later catalog edits never change a purchase.
// ---------------------------------------------------------
export interface PurchaseTextFields {
  itemDescription: string
  partNumber: string
  vendor: string
  unitCost: string
  link: string
}

export function prefillFromPart(
  current: PurchaseTextFields,
  part: { part_number: string; name: string; effective_unit_cost: number | null; preferred_vendor_name: string | null; source_url: string | null },
  preferred: { unit_cost: number | null; product_url: string | null } | null
): PurchaseTextFields {
  const blank = (s: string) => s.trim() === ''
  const cost = preferred?.unit_cost ?? part.effective_unit_cost
  return {
    itemDescription: blank(current.itemDescription) ? part.name : current.itemDescription,
    partNumber: blank(current.partNumber) ? part.part_number : current.partNumber,
    vendor: blank(current.vendor) && part.preferred_vendor_name ? part.preferred_vendor_name : current.vendor,
    unitCost: blank(current.unitCost) && cost !== null && cost !== undefined ? String(cost) : current.unitCost,
    link: blank(current.link) ? preferred?.product_url ?? part.source_url ?? current.link : current.link,
  }
}

export function prefillFromVendor(current: PurchaseTextFields, vendor: { name: string }): PurchaseTextFields {
  return { ...current, vendor: current.vendor.trim() === '' ? vendor.name : current.vendor }
}

export interface PartSummary {
  total: number
  active: number
  withVendor: number
  missing: number
}

// The strip above the parts table: how many parts, how many are active, how many have at least one vendor, and how
// many active parts are missing a cost or a vendor (the ones that need attention).
export function summarizeParts(rows: Pick<PartCatalogRow, 'active' | 'has_vendor' | 'missing_cost'>[]): PartSummary {
  const active = rows.filter((r) => r.active)
  return {
    total: rows.length,
    active: active.length,
    withVendor: rows.filter((r) => r.has_vendor).length,
    missing: active.filter((r) => !r.has_vendor || r.missing_cost).length,
  }
}

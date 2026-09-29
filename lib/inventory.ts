import { formatUsd } from '@/lib/parts'
import type { InventoryOverviewRow, InventoryTransactionKind } from '@/types/database'

// Inventory + Receiving (migration 0038). The database is the real enforcement of every rule here (quantity
// bounds, required reasons, location requirements); this file only gives immediate, friendly feedback and shared
// wording, the same relationship lib/parts.ts has to the parts catalog.

export { formatUsd }

export const TRANSACTION_KIND_LABEL: Record<InventoryTransactionKind, string> = {
  opening_balance: 'Opening Balance',
  receipt: 'Receipt',
  receipt_reversal: 'Receipt Reversal',
  adjustment: 'Adjustment',
  write_off: 'Write-Off',
  transfer_out: 'Transfer Out',
  transfer_in: 'Transfer In',
}

// success (in) / danger (out) / neutral (adjustment can go either way, shown by its sign instead)
export const TRANSACTION_KIND_TONE: Record<InventoryTransactionKind, 'success' | 'danger' | 'neutral'> = {
  opening_balance: 'success',
  receipt: 'success',
  receipt_reversal: 'danger',
  adjustment: 'neutral',
  write_off: 'danger',
  transfer_out: 'danger',
  transfer_in: 'success',
}

export const LOCATION_STATUS_LABEL = { active: 'Active', inactive: 'Inactive' } as const

// Searching the inventory list: part number, name, subsystem, location names.
export function inventoryMatches(row: Pick<InventoryOverviewRow, 'part_number' | 'name' | 'subsystem_name' | 'location_names' | 'category'>, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [row.part_number, row.name, row.subsystem_name, row.location_names, row.category].some((f) => (f ?? '').toLowerCase().includes(q))
}

export function locationMatches(row: { name: string; description: string | null }, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [row.name, row.description].some((f) => (f ?? '').toLowerCase().includes(q))
}

export interface InventorySummary {
  partsTracked: number
  totalOnHand: number
  totalValue: number
  missingCostCount: number
}

// The strip above the inventory table: only ever built from real stock/value, never invented.
export function summarizeInventory(rows: Pick<InventoryOverviewRow, 'on_hand' | 'stock_value' | 'missing_cost'>[]): InventorySummary {
  const withStock = rows.filter((r) => r.on_hand > 0)
  return {
    partsTracked: withStock.length,
    totalOnHand: withStock.reduce((sum, r) => sum + r.on_hand, 0),
    totalValue: rows.reduce((sum, r) => sum + (r.stock_value ?? 0), 0),
    missingCostCount: withStock.filter((r) => r.missing_cost).length,
  }
}

// A quantity typed into a form: whole numbers only (inventory quantities are integers, matching purchasing).
export function parseQuantity(value: string, opts: { allowZero?: boolean; allowNegative?: boolean } = {}): { value: number | null; error: string | null } {
  const v = value.trim()
  if (v === '') return { value: null, error: 'Enter a quantity.' }
  const n = Number(v)
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { value: null, error: 'Enter a whole number.' }
  if (!opts.allowNegative && n < 0) return { value: null, error: 'Enter a quantity of 0 or more.' }
  if (!opts.allowZero && n === 0) return { value: null, error: 'The quantity cannot be zero.' }
  if (Math.abs(n) > 1_000_000) return { value: null, error: 'That quantity is too large.' }
  return { value: n, error: null }
}

export function validateReason(value: string): string | null {
  return value.trim() === '' ? 'A reason is required.' : null
}

import { kindOf, spendIds, type BomLine } from '@/lib/bom'

// Where the team's money has gone, worked out from the Master BOM (the Business "Spending" page). A line counts when it is on a
// PURCHASE LIST or comes from a QUOTE the team ordered from; a plan is not a purchase. A quote that repeats a part already on an
// order sheet (same part number, same vendor) is counted once (see spendIds in lib/bom.ts). A purchase list shows what was put on
// an order; it does not prove the part arrived. These are pure functions so the totals are unit tested.

export interface SpendLine {
  id: string
  subsystem: string
  season: string
  vendor: string | null
  item: string
  part_number: string | null
  total: number
  // came from a quote rather than an order sheet
  fromQuote: boolean
}

export interface SpendGroup {
  key: string
  total: number
  lines: number
  // share of the whole (0 to 1)
  share: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * The lines that count as spent and have a price. Pass the WHOLE BOM (not a season's worth) so a quote is matched against every
 * order sheet; filter the result by season afterwards. Lines with no price are counted separately (see summarizeSpend).
 */
export function spendLines(lines: BomLine[]): SpendLine[] {
  const counted = spendIds(lines)
  return lines
    .filter((l) => counted.has(l.id) && l.total_cost !== null)
    .map((l) => ({ id: l.id, subsystem: l.subsystem, season: l.season, vendor: l.vendor, item: l.item, part_number: l.part_number, total: l.total_cost as number, fromQuote: kindOf(l) === 'quote' }))
}

export interface SpendSummary {
  total: number
  lines: number
  // counted lines with no price in the source, so the total is a floor, not a guess
  unpriced: number
}

/** `counted` is spendIds() of the whole BOM when `lines` is only part of it (a season's worth). */
export function summarizeSpend(lines: BomLine[], counted: ReadonlySet<string> = spendIds(lines)): SpendSummary {
  const mine = lines.filter((l) => counted.has(l.id))
  const priced = mine.filter((l) => l.total_cost !== null)
  return { total: round2(priced.reduce((s, l) => s + (l.total_cost as number), 0)), lines: priced.length, unpriced: mine.length - priced.length }
}

export interface QuoteSpend {
  // quote lines counted as spent, and their money
  lines: number
  total: number
  // quote lines left out because the same part from the same vendor is already on an order sheet, and their money
  repeatedLines: number
  repeatedTotal: number
}

/** How much of the spending comes from quotes, and how many quote lines were left out as repeats of an order-sheet line. */
export function quoteSpend(all: BomLine[]): QuoteSpend {
  const counted = spendIds(all)
  const quotes = all.filter((l) => kindOf(l) === 'quote')
  const used = quotes.filter((l) => counted.has(l.id))
  const repeated = quotes.filter((l) => !counted.has(l.id))
  const sum = (xs: BomLine[]) => round2(xs.reduce((s, l) => s + (l.total_cost ?? 0), 0))
  return { lines: used.length, total: sum(used), repeatedLines: repeated.length, repeatedTotal: sum(repeated) }
}

/** Group spend by any key, biggest first. `label` turns a line into its group name. */
export function groupSpend(lines: SpendLine[], label: (l: SpendLine) => string): SpendGroup[] {
  const grand = lines.reduce((s, l) => s + l.total, 0)
  const map = new Map<string, { total: number; lines: number }>()
  for (const l of lines) {
    const k = label(l)
    const g = map.get(k) ?? { total: 0, lines: 0 }
    g.total += l.total
    g.lines += 1
    map.set(k, g)
  }
  return [...map.entries()]
    .map(([key, g]) => ({ key, total: round2(g.total), lines: g.lines, share: grand > 0 ? g.total / grand : 0 }))
    .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key))
}

/** Seasons oldest first, 'Undated' last (the order a person reads a history in). */
export function seasonOrder(a: string, b: string): number {
  if (a === 'Undated') return 1
  if (b === 'Undated') return -1
  return a.localeCompare(b)
}

export const bySeason = (lines: SpendLine[]): SpendGroup[] => groupSpend(lines, (l) => l.season).sort((a, b) => seasonOrder(a.key, b.key))
export const bySubsystem = (lines: SpendLine[]): SpendGroup[] => groupSpend(lines, (l) => l.subsystem)

/** Vendors, biggest first; anything past `top` is folded into one "Other vendors" row so the list stays readable. */
export function byVendor(lines: SpendLine[], top = 10): SpendGroup[] {
  const all = groupSpend(lines, (l) => l.vendor ?? 'No vendor listed')
  if (all.length <= top) return all
  const head = all.slice(0, top)
  const rest = all.slice(top)
  const total = round2(rest.reduce((s, g) => s + g.total, 0))
  const grand = lines.reduce((s, l) => s + l.total, 0)
  return [...head, { key: `Other vendors (${rest.length})`, total, lines: rest.reduce((s, g) => s + g.lines, 0), share: grand > 0 ? total / grand : 0 }]
}

export interface SpendMatrix {
  seasons: string[]
  rows: { subsystem: string; total: number; bySeason: Record<string, number> }[]
  seasonTotals: Record<string, number>
}

/** Subsystem rows by season columns: where the money went each year. Rows are biggest first. */
export function subsystemBySeason(lines: SpendLine[]): SpendMatrix {
  const seasons = Array.from(new Set(lines.map((l) => l.season))).sort(seasonOrder)
  const rows = new Map<string, { total: number; bySeason: Record<string, number> }>()
  const seasonTotals: Record<string, number> = {}
  for (const l of lines) {
    const r = rows.get(l.subsystem) ?? { total: 0, bySeason: {} }
    r.total += l.total
    r.bySeason[l.season] = round2((r.bySeason[l.season] ?? 0) + l.total)
    rows.set(l.subsystem, r)
    seasonTotals[l.season] = round2((seasonTotals[l.season] ?? 0) + l.total)
  }
  return {
    seasons,
    rows: [...rows.entries()].map(([subsystem, r]) => ({ subsystem, total: round2(r.total), bySeason: r.bySeason })).sort((a, b) => b.total - a.total || a.subsystem.localeCompare(b.subsystem)),
    seasonTotals,
  }
}

/** The biggest single purchase lines. */
export function largestPurchases(lines: SpendLine[], n = 10): SpendLine[] {
  return [...lines].sort((a, b) => b.total - a.total || a.item.localeCompare(b.item)).slice(0, n)
}

/** "2022-23 to 2025-26" from the seasons present, ignoring Undated; a single season is just that season. */
export function seasonSpan(seasons: string[]): string | null {
  const dated = seasons.filter((s) => s !== 'Undated').sort()
  if (dated.length === 0) return null
  return dated.length === 1 ? dated[0] : `${dated[0]} to ${dated[dated.length - 1]}`
}

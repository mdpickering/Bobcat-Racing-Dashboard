import type { StatusTone } from '@/lib/status'

// The BOM lookup (migration 0044): the team's Master BOM as a read-only reference. Pure functions only, so the
// rules the page relies on (what counts as spend, how lines group into parts, how a search matches) are unit tested.

export type BomRecordType = 'Purchase list' | 'Quote' | 'Planned BOM' | 'Team master BOM' | 'CAD part list'

export interface BomLine {
  id: string
  subsystem: string
  sub_assembly: string | null
  season: string
  ordered_on: string | null
  item: string
  part_number: string | null
  vendor: string | null
  unit_cost: number | null
  quantity: number | null
  total_cost: number | null
  link: string | null
  original_link: string | null
  record_type: BomRecordType
  members: string | null
  notes: string | null
  source_files: string | null
  subsystem_basis: string | null
  review_flag: string | null
  sort_order: number
}

// What a line is worth as evidence. A purchase list is an order sheet (it does not prove the part arrived or is on the
// car); a quote has no record of being ordered; everything else is a plan or a list.
export type BomKind = 'purchase' | 'quote' | 'plan'

export const RECORD_KIND: Record<BomRecordType, BomKind> = {
  'Purchase list': 'purchase',
  Quote: 'quote',
  'Planned BOM': 'plan',
  'Team master BOM': 'plan',
  'CAD part list': 'plan',
}

export const KIND_LABEL: Record<BomKind, string> = { purchase: 'Purchase', quote: 'Quote', plan: 'Plan' }
export const KIND_TONE: Record<BomKind, StatusTone> = { purchase: 'info', quote: 'warning', plan: 'neutral' }
export const KIND_HINT: Record<BomKind, string> = {
  purchase: 'Appears on a purchase order or purchasing list. This does not prove it arrived.',
  quote: 'A quote only: there is no record it was ordered.',
  plan: 'A planned BOM or part list, not a purchase.',
}

export const kindOf = (line: Pick<BomLine, 'record_type'>): BomKind => RECORD_KIND[line.record_type]

/** Numbers arrive from Postgres as strings (numeric) or numbers; blank stays null. */
export function normalizeBomLine(row: BomLine): BomLine {
  const n = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))
  return { ...row, unit_cost: n(row.unit_cost), total_cost: n(row.total_cost), quantity: n(row.quantity), sort_order: Number(row.sort_order) }
}

/**
 * Every word you type must appear somewhere on the line ("bearing mcmaster" finds McMaster bearings), case-insensitive,
 * across the item, part number, vendor, sub-assembly, subsystem, notes and members.
 */
export function bomMatches(line: BomLine, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = [line.item, line.part_number, line.vendor, line.sub_assembly, line.subsystem, line.notes, line.members]
    .map((f) => (f ?? '').toLowerCase())
    .join(' \n ')
  return words.every((w) => haystack.includes(w))
}

export interface BomSummary {
  lines: number
  distinctParts: number
  // money on purchase lists / quotes only: plans are not spend, and quotes are not spend either
  purchaseTotal: number
  quoteTotal: number
  needsReview: number
}

export function summarizeBom(lines: BomLine[]): BomSummary {
  const parts = new Set<string>()
  let purchaseTotal = 0
  let quoteTotal = 0
  let needsReview = 0
  for (const l of lines) {
    parts.add(partKey(l))
    const kind = kindOf(l)
    if (kind === 'purchase') purchaseTotal += l.total_cost ?? 0
    if (kind === 'quote') quoteTotal += l.total_cost ?? 0
    if (l.review_flag) needsReview += 1
  }
  return { lines: lines.length, distinctParts: parts.size, purchaseTotal: round2(purchaseTotal), quoteTotal: round2(quoteTotal), needsReview }
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Lines with the same part number are the same part; a line without one is grouped by its (lower-cased) item name. */
export function partKey(line: Pick<BomLine, 'part_number' | 'item'>): string {
  const pn = line.part_number?.trim().toLowerCase()
  return pn ? `pn:${pn}` : `item:${line.item.trim().toLowerCase()}`
}

export interface BomPart {
  key: string
  part_number: string | null
  item: string
  subsystems: string[]
  vendors: string[]
  seasons: string[]
  lineCount: number
  // units across purchase lists only (what the team actually put on an order)
  orderedQuantity: number
  // the unit cost on the most recent dated purchase line, else the most recent line that has a cost
  latestUnitCost: number | null
  link: string | null
  flagged: boolean
  kinds: BomKind[]
}

const SEASON_ORDER = (s: string) => (s === 'Undated' ? '0000' : s)
const uniqSorted = (xs: (string | null)[]) => Array.from(new Set(xs.filter((x): x is string => Boolean(x)))).sort((a, b) => a.localeCompare(b))

/** One row per distinct part, newest information winning for the item name, link and cost. Sorted by item name. */
export function groupByPart(lines: BomLine[]): BomPart[] {
  const groups = new Map<string, BomLine[]>()
  for (const l of lines) {
    const k = partKey(l)
    const g = groups.get(k)
    if (g) g.push(l)
    else groups.set(k, [l])
  }
  const parts: BomPart[] = []
  for (const [key, group] of groups) {
    // newest first: dated lines by date, then by season, then workbook order
    const newestFirst = [...group].sort(
      (a, b) =>
        (b.ordered_on ?? '').localeCompare(a.ordered_on ?? '') ||
        SEASON_ORDER(b.season).localeCompare(SEASON_ORDER(a.season)) ||
        b.sort_order - a.sort_order
    )
    const costed = (l: BomLine) => l.unit_cost !== null
    const latest = newestFirst.find((l) => kindOf(l) === 'purchase' && costed(l)) ?? newestFirst.find(costed)
    parts.push({
      key,
      part_number: group.find((l) => l.part_number)?.part_number ?? null,
      item: newestFirst[0].item,
      subsystems: uniqSorted(group.map((l) => l.subsystem)),
      vendors: uniqSorted(group.map((l) => l.vendor)),
      seasons: uniqSorted(group.map((l) => l.season)).sort((a, b) => SEASON_ORDER(a).localeCompare(SEASON_ORDER(b))),
      lineCount: group.length,
      orderedQuantity: group.filter((l) => kindOf(l) === 'purchase').reduce((sum, l) => sum + (l.quantity ?? 0), 0),
      latestUnitCost: latest?.unit_cost ?? null,
      link: newestFirst.find((l) => l.link)?.link ?? null,
      flagged: group.some((l) => Boolean(l.review_flag)),
      kinds: Array.from(new Set(group.map(kindOf))),
    })
  }
  return parts.sort((a, b) => a.item.localeCompare(b.item))
}

/**
 * 'YYYY-MM-DD' -> "Mar 4, 2026". The column is a calendar date with no time zone, so it is formatted as UTC: going through
 * the viewer's local zone (as lib/format's formatDate does for real timestamps) would show it a day early in the US.
 */
export function formatOrderDate(isoDate: string | null | undefined): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}/.test(isoDate)) return '—'
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** A link is only ever rendered as a link when it is a plain http(s) address (the database enforces this too). */
export function safeHttpUrl(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null
}

/** Season options newest first, with 'Undated' last. */
export function seasonOptions(lines: Pick<BomLine, 'season'>[]): string[] {
  return Array.from(new Set(lines.map((l) => l.season))).sort((a, b) => {
    if (a === 'Undated') return 1
    if (b === 'Undated') return -1
    return b.localeCompare(a)
  })
}

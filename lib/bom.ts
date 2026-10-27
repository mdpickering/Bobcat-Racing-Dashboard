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
  // the admin review queue (migration 0045)
  review_status: ReviewStatus
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  sort_order: number
}

export type ReviewStatus = 'open' | 'checked' | 'ignored'

// ---------------------------------------------------------
// Which flags are worth a person's time. The workbook flags 171 of 335 lines, but most of those are housekeeping the
// page already explains by itself (a link rebuilt from the part number, a date taken from a file name, "Quote only"
// when the badge already says Quote). Only a flag that asks a real question counts as "needs checking"; the rest
// stay visible as quiet notes.
// ---------------------------------------------------------
export type FlagSeverity = 'check' | 'note'

const CHECK_PATTERNS: RegExp[] = [
  /confirm which/i, // "Confirm which vendor was ordered", "Confirm which set is on the car"
  /check which/i, // "check which is right"
  /reorder or repeated entry/i, // the same part/qty/price on two dates
  /assign a subsystem/i, // no subsystem could be worked out
  /link goes to/i, // "Vendor listed as X but link goes to Y", "Link goes to part A but sheet says B"
  /could be /i, // "Could be drivetrain or steering shaft"
  /conflicts with/i, // "File name year (23) conflicts with quote date (2024)"
  /name corrected/i,
  /rack itself is not/i,
  /fitment/i, // "Tie rod kit fitment per vendor page: ..." (may not fit our car)
]

/** null = no flag; 'check' = a real question for a person; 'note' = housekeeping, shown quietly. */
export function flagSeverity(flag: string | null | undefined): FlagSeverity | null {
  const f = flag?.trim()
  if (!f) return null
  return CHECK_PATTERNS.some((p) => p.test(f)) ? 'check' : 'note'
}

/** Counts as "needs checking": a real question that nobody has reviewed yet. */
export const needsCheck = (l: Pick<BomLine, 'review_flag' | 'review_status'>): boolean => l.review_status === 'open' && flagSeverity(l.review_flag) === 'check'

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = { open: 'Open', checked: 'Checked', ignored: 'Ignored' }

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

export const RECORD_TYPES: BomRecordType[] = ['Purchase list', 'Quote', 'Planned BOM', 'Team master BOM', 'CAD part list']

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
  return {
    ...row,
    unit_cost: n(row.unit_cost),
    total_cost: n(row.total_cost),
    quantity: n(row.quantity),
    sort_order: Number(row.sort_order),
    review_status: row.review_status ?? 'open',
    review_note: row.review_note ?? null,
    reviewed_by: row.reviewed_by ?? null,
    reviewed_at: row.reviewed_at ?? null,
  }
}

export interface BomCostRow {
  line_id: string
  unit_cost: number | string | null
  total_cost: number | string | null
}

/**
 * Prices live in their own table that only Business members and cto/admin can read (migration 0045), so everyone else
 * simply gets no rows back. Every line's cost is set from that table; a line with no row has no cost.
 */
export function attachCosts(lines: BomLine[], costs: BomCostRow[]): BomLine[] {
  const byLine = new Map(costs.map((c) => [c.line_id, c]))
  return lines.map((l) => {
    const c = byLine.get(l.id)
    return { ...l, unit_cost: c && c.unit_cost !== null ? Number(c.unit_cost) : null, total_cost: c && c.total_cost !== null ? Number(c.total_cost) : null }
  })
}

/** People who may see prices: Business members and cto/admin (mirrors public.can_view_bom_costs()). */
export const canSeeBomCosts = (a: { isBusinessMember: boolean; isCtoOrAdmin: boolean }): boolean => a.isBusinessMember || a.isCtoOrAdmin

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
  // how many lines are on purchase lists / are quotes (the counts people without price access see instead of money)
  purchaseLines: number
  quoteLines: number
  // money on purchase lists / quotes only: plans are not spend, and quotes are not spend either
  purchaseTotal: number
  quoteTotal: number
  needsReview: number
}

export function summarizeBom(lines: BomLine[]): BomSummary {
  const parts = new Set<string>()
  let purchaseTotal = 0
  let quoteTotal = 0
  let purchaseLines = 0
  let quoteLines = 0
  let needsReview = 0
  for (const l of lines) {
    parts.add(partKey(l))
    const kind = kindOf(l)
    if (kind === 'purchase') {
      purchaseLines += 1
      purchaseTotal += l.total_cost ?? 0
    }
    if (kind === 'quote') {
      quoteLines += 1
      quoteTotal += l.total_cost ?? 0
    }
    if (needsCheck(l)) needsReview += 1
  }
  return { lines: lines.length, distinctParts: parts.size, purchaseLines, quoteLines, purchaseTotal: round2(purchaseTotal), quoteTotal: round2(quoteTotal), needsReview }
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
      flagged: group.some(needsCheck),
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

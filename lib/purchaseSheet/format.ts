// Pure helpers for the purchase sheet: which text goes in a cell, and how much room it needs.
// No spreadsheet library in here, so all of it is unit-testable.

// A request can be exported once it is approved, and stays exportable through the rest of its life.
export const EXPORTABLE_STATUSES = ['Approved', 'Ordered', 'In Transit', 'Arrived in Shop', 'Completed'] as const

export function isExportableStatus(status: string): boolean {
  return (EXPORTABLE_STATUSES as readonly string[]).includes(status)
}

export function purchaseSheetFileName(requestId: string): string {
  return `Purchase_Request_${requestId}.xlsx`
}

/** The vendor as entered on the request; if it was left blank, the store's domain from the item's link. */
export function vendorName(requestVendor: string | null | undefined, link: string | null | undefined): string {
  const typed = requestVendor?.trim()
  if (typed) return typed
  if (!link) return ''
  try {
    return new URL(link.trim()).hostname.replace(/^www\./i, '')
  } catch {
    return ''
  }
}

/** "Chris Dunn" -> "CD", "Jordan" -> "J", "Mary Jane Smith" -> "MS"; falls back to the email name. */
export function initials(displayName: string | null | undefined, email: string | null | undefined): string {
  const words = (displayName ?? '').trim().split(/\s+/).filter(Boolean)
  const source = words.length > 0 ? words : (email ?? '').split('@')[0].split(/[._\-+]+/).filter(Boolean)
  if (source.length === 0) return ''
  const first = source[0][0]
  const last = source.length > 1 ? source[source.length - 1][0] : ''
  return (first + last).toUpperCase()
}

/** A compact, readable form of a URL for the cell text ("mcmaster.com/92186A394"); the hyperlink keeps the full URL. */
export function displayUrl(url: string, maxChars = 46): string {
  const short = url
    .trim()
    .replace(/^https?:\/\/(www\.)?/i, '')
    .replace(/\/+$/, '')
  return short.length > maxChars ? `${short.slice(0, maxChars - 1)}…` : short
}

/** The calendar date (YYYY-MM-DD) of an instant in the team's timezone, so late-evening requests keep their day. */
export function easternDateKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}

/** An Excel date cell value for that calendar day (midnight UTC of the date, which Excel shows as that date). */
export function excelDate(iso: string): Date {
  const [y, m, d] = easternDateKey(iso).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

const NARROW = new Set("il.,;:'!|`".split(''))
const WIDE = new Set('mwMW@%&'.split(''))

// Approximate width of text in Excel column-width units for 12pt Calibri (a digit is about 1.1 units).
// Deliberately a little generous, so text is not clipped.
export function textUnits(text: string, bold = false): number {
  let units = 0
  for (const ch of text) {
    if (ch === ' ') units += 0.5
    else if (NARROW.has(ch)) units += 0.5
    else if (WIDE.has(ch)) units += 1.6
    else if (ch >= 'A' && ch <= 'Z') units += 1.25
    else if (ch >= '0' && ch <= '9') units += 1.1
    else units += 1.0
  }
  return units * (bold ? 1.08 : 1)
}

export const CELL_PADDING = 1.6

/** How many lines `text` takes when wrapped in a column `width` units wide (greedy, breaking overlong words). */
export function wrappedLineCount(text: string, width: number): number {
  const room = Math.max(width - CELL_PADDING, 1)
  let lines = 0
  for (const paragraph of text.split(/\r?\n/)) {
    if (paragraph.trim() === '') {
      lines += 1
      continue
    }
    let current = 0
    let count = 1
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const w = textUnits(word)
      const space = current === 0 ? 0 : 0.5
      if (w > room) {
        // a word wider than the column breaks across lines
        const extra = Math.ceil((w + (current === 0 ? 0 : current + space)) / room) - 1
        count += current === 0 ? Math.max(extra, 0) : Math.max(extra, 1)
        current = ((w + (current === 0 ? 0 : current + space)) % room) || room
      } else if (current + space + w > room) {
        count += 1
        current = w
      } else {
        current += space + w
      }
    }
    lines += count
  }
  return Math.max(lines, 1)
}

/** The narrowest width (within min..max) that shows `values` on one line, or `max` if they need to wrap. */
export function fitWidth(values: string[], min: number, max: number, headerUnits: number): number {
  const natural = values.reduce((widest, v) => Math.max(widest, ...v.split(/\r?\n/).map((line) => textUnits(line) + CELL_PADDING)), 0)
  return Math.min(Math.max(min, natural, headerUnits), Math.max(max, headerUnits))
}

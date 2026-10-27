import { isTaskSize, type TaskSize } from '@/lib/pickup'

// "Add several tasks": paste one task per line and create them all in one go. This file parses and checks the text; the page
// then creates each task with the ordinary task insert (so the usual rules apply: only cto/admin or a subsystem's lead can add
// a task there) and, when a size is given, puts it on the pick-up board.
//
//   Subsystem | Category | Title | size | Description (optional)
//
// Category and size may be left blank. Lines that are blank or start with # are ignored. A subsystem or category may be
// written in short ("Fabrication") as long as it matches only one.

export interface BulkSubsystem {
  id: string
  name: string
}

export interface BulkCategory {
  id: string
  name: string
  subsystem_id: string
}

export type BulkRowStatus = 'ok' | 'duplicate' | 'error'

export interface BulkRow {
  line: number
  raw: string
  title: string
  subsystemId: string | null
  subsystemName: string | null
  categoryId: string | null
  categoryName: string | null
  size: TaskSize | null
  description: string | null
  status: BulkRowStatus
  message: string | null
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Exact match first; otherwise a name that starts with, or contains, what was typed, as long as only one does. */
export function matchName<T extends { name: string }>(typed: string, options: T[]): { match: T | null; ambiguous: boolean } {
  const t = norm(typed)
  if (!t) return { match: null, ambiguous: false }
  const exact = options.filter((o) => norm(o.name) === t)
  if (exact.length === 1) return { match: exact[0], ambiguous: false }
  for (const test of [(n: string) => n.startsWith(t), (n: string) => n.includes(t)]) {
    const hits = options.filter((o) => test(norm(o.name)))
    if (hits.length === 1) return { match: hits[0], ambiguous: false }
    if (hits.length > 1) return { match: null, ambiguous: true }
  }
  return { match: null, ambiguous: false }
}

export function parseSize(typed: string): { size: TaskSize | null; ok: boolean } {
  const t = typed.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (t === '' || t === 'none' || t === 'no') return { size: null, ok: true }
  if (t === 'halfday') return { size: 'half_day', ok: true }
  return isTaskSize(t) ? { size: t, ok: true } : { size: null, ok: false }
}

const MAX_TITLE = 200
const MAX_DESCRIPTION = 2000

export const titleKey = (subsystemId: string, title: string): string => `${subsystemId}::${title.trim().toLowerCase().replace(/\s+/g, ' ')}`

export interface ParseOptions {
  subsystems: BulkSubsystem[]
  categories: BulkCategory[]
  // the subsystems this person may add tasks to (cto/admin: all of them; a lead: the ones they lead)
  allowedSubsystemIds: Set<string>
  // titleKey()s of tasks that already exist, so pressing Create twice cannot make duplicates
  existing: Set<string>
}

export function parseBulkTasks(text: string, opts: ParseOptions): BulkRow[] {
  const seen = new Set(opts.existing)
  const rows: BulkRow[] = []
  text.split(/\r?\n/).forEach((raw, i) => {
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const parts = trimmed.split('|')
    const [subTyped = '', catTyped = '', titleTyped = '', sizeTyped = ''] = parts.map((p) => p.trim())
    const description = parts.length > 4 ? parts.slice(4).join('|').trim() || null : null

    const row: BulkRow = { line: i + 1, raw: trimmed, title: titleTyped, subsystemId: null, subsystemName: null, categoryId: null, categoryName: null, size: null, description, status: 'ok', message: null }
    const fail = (message: string) => {
      row.status = 'error'
      row.message = message
      rows.push(row)
    }

    if (parts.length < 3) return fail('Write it as: Subsystem | Category | Title | size | Description')
    if (!titleTyped) return fail('This line has no title.')
    if (titleTyped.length > MAX_TITLE) return fail(`The title is longer than ${MAX_TITLE} characters.`)
    if (description && description.length > MAX_DESCRIPTION) return fail(`The description is longer than ${MAX_DESCRIPTION} characters.`)

    const sub = matchName(subTyped, opts.subsystems)
    if (!sub.match) return fail(sub.ambiguous ? `"${subTyped}" matches more than one subsystem. Type more of the name.` : `No subsystem called "${subTyped}".`)
    row.subsystemId = sub.match.id
    row.subsystemName = sub.match.name
    if (!opts.allowedSubsystemIds.has(sub.match.id)) return fail(`You can only add tasks to subsystems you lead. ${sub.match.name} is not one of them.`)

    if (catTyped) {
      const cat = matchName(catTyped, opts.categories.filter((c) => c.subsystem_id === sub.match!.id))
      if (!cat.match) return fail(cat.ambiguous ? `"${catTyped}" matches more than one category in ${sub.match.name}.` : `${sub.match.name} has no category called "${catTyped}".`)
      row.categoryId = cat.match.id
      row.categoryName = cat.match.name
    }

    const size = parseSize(sizeTyped)
    if (!size.ok) return fail(`Size must be quick, short or half_day (or left blank). Got "${sizeTyped}".`)
    row.size = size.size

    const key = titleKey(sub.match.id, titleTyped)
    if (seen.has(key)) {
      row.status = 'duplicate'
      row.message = 'A task with this title already exists in that subsystem, so it will be skipped.'
    } else {
      seen.add(key)
    }
    rows.push(row)
  })
  return rows
}

export function summarizeBulk(rows: BulkRow[]): { ok: number; duplicate: number; error: number } {
  return {
    ok: rows.filter((r) => r.status === 'ok').length,
    duplicate: rows.filter((r) => r.status === 'duplicate').length,
    error: rows.filter((r) => r.status === 'error').length,
  }
}

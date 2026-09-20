// Task deadlines are DATE-ONLY values ("due Sep 15"), not moments in time.
//
// tasks.deadline is a timestamptz, but by convention (the create/edit task forms and the
// Phase 6.8 import) a deadline is stored as midnight UTC of its calendar date, e.g.
// 2026-09-15T00:00:00+00:00. Reading that with local-time Date methods shifts it back a
// day for anyone west of UTC (Sep 14 in America/New_York), so every read of a task
// deadline goes through this module, which uses the UTC calendar date and nothing else.
//
// Do NOT use these for real date+time values (created_at, event start_time, ...): those
// keep using the local-time helpers in lib/format.ts.

const pad = (n: number) => String(n).padStart(2, '0')

/** The deadline's calendar date as 'YYYY-MM-DD' (its UTC date), or null if empty/invalid. */
export function deadlineDateKey(deadline: string | null | undefined): string | null {
  if (!deadline) return null
  const d = new Date(deadline)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** Formats a task deadline as the exact calendar date it was stored as; '—' when empty. */
export function formatDeadline(deadline: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!deadlineDateKey(deadline)) return '—'
  return new Date(deadline as string).toLocaleDateString(undefined, {
    ...(opts ?? { month: 'short', day: 'numeric', year: 'numeric' }),
    timeZone: 'UTC',
  })
}

/** The viewer's own current calendar date as 'YYYY-MM-DD' ("today"). */
export function todayDateKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** Overdue once the due date is strictly before today; a task due today is not overdue. */
export function isDeadlineOverdue(deadline: string | null | undefined, status?: string, now: Date = new Date()): boolean {
  const key = deadlineDateKey(deadline)
  if (!key || status === 'Complete') return false
  return key < todayDateKey(now)
}

/** Due soon = due between today and `withinDays` days from today, inclusive. */
export function isDeadlineDueSoon(
  deadline: string | null | undefined,
  status?: string,
  withinDays = 7,
  now: Date = new Date()
): boolean {
  const key = deadlineDateKey(deadline)
  if (!key || status === 'Complete') return false
  const today = todayDateKey(now)
  return key >= today && key <= addDaysToKey(today, withinDays)
}

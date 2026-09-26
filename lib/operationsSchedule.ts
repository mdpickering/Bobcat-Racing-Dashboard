// Pure scheduling arithmetic for the Operations workspace. It reads only data that already exists (open tasks with a
// date-only deadline, calendar events, milestones) and follows the existing date rules from lib/deadline.ts:
// a task deadline is a calendar DATE ('YYYY-MM-DD', its UTC date), never a moment in time; "today" is the viewer's own
// calendar date. Nothing here invents a new interpretation of dates and nothing is a made-up score.

import { deadlineDateKey } from '@/lib/deadline'

const pad = (n: number) => String(n).padStart(2, '0')

export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

const keyToUtc = (key: string) => {
  const [y, m, d] = key.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

// whole days from `from` to `to` (negative = `to` is earlier)
export function daysBetweenKeys(from: string, to: string): number {
  return Math.round((keyToUtc(to) - keyToUtc(from)) / 86_400_000)
}

// ---------------------------------------------------------
// Deadline groups
// ---------------------------------------------------------
export type DeadlineBucket = 'overdue' | 'today' | 'tomorrow' | 'next_7' | 'following_7' | 'later' | 'none'

export const DEADLINE_BUCKETS: { bucket: DeadlineBucket; label: string; description: string }[] = [
  { bucket: 'overdue', label: 'Overdue', description: 'Due before today and not complete.' },
  { bucket: 'today', label: 'Today', description: 'Due today.' },
  { bucket: 'tomorrow', label: 'Tomorrow', description: 'Due tomorrow.' },
  { bucket: 'next_7', label: 'Next 7 days', description: 'Due in 2 to 7 days.' },
  { bucket: 'following_7', label: 'The following week', description: 'Due in 8 to 14 days.' },
  { bucket: 'later', label: 'Later', description: 'Due more than 14 days from now.' },
  { bucket: 'none', label: 'No deadline', description: 'Open tasks nobody has scheduled yet.' },
]

// Which group a deadline falls in, relative to today's date key. `deadline` is the stored task deadline.
export function bucketFor(deadline: string | null | undefined, today: string): DeadlineBucket {
  const key = deadlineDateKey(deadline)
  if (!key) return 'none'
  const days = daysBetweenKeys(today, key)
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days <= 7) return 'next_7'
  if (days <= 14) return 'following_7'
  return 'later'
}

export interface HasDeadline {
  deadline: string | null
}

// Groups tasks in a fixed order (soonest first inside a group, overdue oldest-first so the most late is on top).
export function groupDeadlines<T extends HasDeadline>(tasks: T[], today: string): { bucket: DeadlineBucket; label: string; description: string; tasks: T[] }[] {
  const sorted = [...tasks].sort((a, b) => {
    const ka = deadlineDateKey(a.deadline)
    const kb = deadlineDateKey(b.deadline)
    if (ka === kb) return 0
    if (ka === null) return 1
    if (kb === null) return -1
    return ka < kb ? -1 : 1
  })
  return DEADLINE_BUCKETS.map((b) => ({ ...b, tasks: sorted.filter((t) => bucketFor(t.deadline, today) === b.bucket) }))
}

export function deadlineCounts<T extends HasDeadline>(tasks: T[], today: string): Record<DeadlineBucket, number> {
  const counts: Record<DeadlineBucket, number> = { overdue: 0, today: 0, tomorrow: 0, next_7: 0, following_7: 0, later: 0, none: 0 }
  for (const t of tasks) counts[bucketFor(t.deadline, today)]++
  return counts
}

// "3 days overdue" / "today" / "in 4 days" for a deadline, relative to today.
export function relativeDeadline(deadline: string | null | undefined, today: string): string {
  const key = deadlineDateKey(deadline)
  if (!key) return 'No deadline'
  const days = daysBetweenKeys(today, key)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return '1 day overdue'
  if (days < 0) return `${-days} days overdue`
  return `In ${days} days`
}

// ---------------------------------------------------------
// Subsystem schedule
// ---------------------------------------------------------
export interface ScheduleTask extends HasDeadline {
  id: string
  title: string
  status: string
  subsystem_id: string
}

export interface ScheduleEvent {
  id: string
  title: string
  start_time: string
  subsystem_id: string | null
}

export interface ScheduleMilestone {
  id: string
  name: string
  date: string
  subsystem_id: string | null
}

export interface SubsystemScheduleRow {
  subsystemId: string
  name: string
  open: number
  overdue: number
  dueNext7: number
  dueNext14: number
  noDeadline: number
  nextDeadline: { key: string; title: string; taskId: string } | null
  nextEvent: { start: string; title: string } | null
  nextMilestone: { key: string; name: string } | null
  // Plain-language reasons this subsystem's schedule may need a look. Both rules are stated on the page:
  //   overdue     = open tasks whose deadline is before today
  //   unscheduled = open tasks with no deadline
  // Nothing is scored or averaged.
  attention: { kind: 'overdue' | 'unscheduled'; count: number }[]
}

export function subsystemSchedule(
  subsystems: { id: string; name: string }[],
  tasks: ScheduleTask[],
  events: ScheduleEvent[],
  milestones: ScheduleMilestone[],
  today: string,
  now: Date = new Date()
): SubsystemScheduleRow[] {
  return subsystems.map((s) => {
    const mine = tasks.filter((t) => t.subsystem_id === s.id && t.status !== 'Complete')
    const bucketOf = (t: ScheduleTask) => bucketFor(t.deadline, today)
    const overdue = mine.filter((t) => bucketOf(t) === 'overdue').length
    const noDeadline = mine.filter((t) => bucketOf(t) === 'none').length
    const dueNext7 = mine.filter((t) => ['today', 'tomorrow', 'next_7'].includes(bucketOf(t))).length
    const dueNext14 = mine.filter((t) => ['today', 'tomorrow', 'next_7', 'following_7'].includes(bucketOf(t))).length
    const upcoming = mine
      .filter((t) => deadlineDateKey(t.deadline) && bucketOf(t) !== 'overdue')
      .sort((a, b) => (deadlineDateKey(a.deadline)! < deadlineDateKey(b.deadline)! ? -1 : 1))[0]
    const nextEvent = events
      .filter((e) => e.subsystem_id === s.id && new Date(e.start_time).getTime() >= now.getTime())
      .sort((a, b) => (a.start_time < b.start_time ? -1 : 1))[0]
    const nextMilestone = milestones
      .filter((m) => m.subsystem_id === s.id && m.date.slice(0, 10) >= today)
      .sort((a, b) => (a.date < b.date ? -1 : 1))[0]
    const attention: SubsystemScheduleRow['attention'] = []
    if (overdue > 0) attention.push({ kind: 'overdue', count: overdue })
    if (noDeadline > 0) attention.push({ kind: 'unscheduled', count: noDeadline })
    return {
      subsystemId: s.id,
      name: s.name,
      open: mine.length,
      overdue,
      dueNext7,
      dueNext14,
      noDeadline,
      nextDeadline: upcoming ? { key: deadlineDateKey(upcoming.deadline)!, title: upcoming.title, taskId: upcoming.id } : null,
      nextEvent: nextEvent ? { start: nextEvent.start_time, title: nextEvent.title } : null,
      nextMilestone: nextMilestone ? { key: nextMilestone.date.slice(0, 10), name: nextMilestone.name } : null,
      attention,
    }
  })
}

// Most in need of a look first: overdue, then unscheduled, then the busiest; quiet subsystems last.
export function sortByAttention(rows: SubsystemScheduleRow[]): SubsystemScheduleRow[] {
  return [...rows].sort((a, b) => b.overdue - a.overdue || b.noDeadline - a.noDeadline || b.open - a.open || a.name.localeCompare(b.name))
}

// ---------------------------------------------------------
// Agenda (used by the client component that groups by the viewer's own calendar dates)
// ---------------------------------------------------------
export type AgendaKind = 'event' | 'deadline' | 'milestone' | 'recurring'

export interface AgendaItem {
  id: string
  kind: AgendaKind
  title: string
  // events: the real start timestamp; deadlines and milestones are date-only, so they carry a 'YYYY-MM-DD' key instead
  start?: string
  dateKey?: string
  // team / subsystem name, when there is one
  team?: string | null
  href?: string
  overdue?: boolean
  // recurring weekly events: 0 = Sunday … 6 = Saturday (as stored), plus the free-text time label
  weekday?: number
  timeLabel?: string | null
}

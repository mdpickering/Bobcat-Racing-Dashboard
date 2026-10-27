// The pick-up board (migration 0046): small tasks anyone on the team can grab. The database is the real enforcement of
// every rule here (who can claim, the 2-task limit, who can put a task on the board); this file holds the shared
// wording and the pure helpers the page uses, so they can be unit tested.

export type TaskSize = 'quick' | 'short' | 'half_day'

export const TASK_SIZES: TaskSize[] = ['quick', 'short', 'half_day']

export const SIZE_LABEL: Record<TaskSize, string> = { quick: 'Quick', short: 'Short', half_day: 'Half day' }
export const SIZE_HINT: Record<TaskSize, string> = { quick: 'About 15 minutes', short: 'About an hour', half_day: 'A few hours' }

// the most pick-up tasks one person can hold open at a time (also enforced in claim_pickup_task())
export const MAX_PICKUP_TASKS = 2

export interface PickupTask {
  id: string
  title: string
  description: string | null
  subsystem_id: string
  subsystem_name: string
  size: TaskSize
  priority: 'Critical' | 'High' | 'Medium' | 'Low'
  deadline: string | null
  created_at: string
}

const SIZE_ORDER: Record<TaskSize, number> = { quick: 0, short: 1, half_day: 2 }
const PRIORITY_ORDER: Record<PickupTask['priority'], number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }

/**
 * The board order: quickest first (the point is something small to do right now), then the more important, then the
 * longest-waiting.
 */
export function sortPickupTasks<T extends Pick<PickupTask, 'size' | 'priority' | 'created_at'>>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => SIZE_ORDER[a.size] - SIZE_ORDER[b.size] || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.created_at.localeCompare(b.created_at))
}

/** How many more pick-up tasks this person can take right now. */
export const slotsLeft = (openCount: number): number => Math.max(0, MAX_PICKUP_TASKS - openCount)

/** Whole days since an ISO timestamp (never negative), used to say how long a task has been waiting. */
export function daysWaiting(createdAt: string, now: Date = new Date()): number {
  const ms = now.getTime() - new Date(createdAt).getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

export const isTaskSize = (v: unknown): v is TaskSize => typeof v === 'string' && (TASK_SIZES as string[]).includes(v)

/** "Waiting 1 day" / "Waiting 12 days" / "New today". */
export function waitingLabel(days: number): string {
  if (days <= 0) return 'New today'
  return `Waiting ${days} day${days === 1 ? '' : 's'}`
}

/** The people who may put a task on the board (mirrors set_task_size()): its subsystem's lead, the COO, cto/admin. */
export function canSetTaskSize(opts: { isCtoOrAdmin: boolean; isCoo: boolean; leadsSubsystem: boolean }): boolean {
  return opts.isCtoOrAdmin || opts.isCoo || opts.leadsSubsystem
}

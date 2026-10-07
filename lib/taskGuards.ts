import { deadlineDateKey, todayDateKey } from '@/lib/deadline'

// Soft safeguards for task planning. They never block a save: a task's assignee can change its status but not its
// deadline or owner (the database enforces that), so a hard requirement here would just strand them. Instead the UI
// says plainly what is missing and who can fix it.

type Plannable = { deadline: string | null; primary_owner_id: string | null }

/** What an open task is missing: any of 'No deadline', 'No owner'. A completed task is never "missing" anything. */
export function planningGaps(task: Plannable & { status: string }): string[] {
  if (task.status === 'Complete') return []
  const gaps: string[] = []
  if (!deadlineDateKey(task.deadline)) gaps.push('No deadline')
  if (!task.primary_owner_id) gaps.push('No owner')
  return gaps
}

/** A message to show right after a task is moved to In Progress or Review while it has no deadline and/or owner. */
export function startNudge(task: Plannable, nextStatus: string): string | null {
  if (nextStatus !== 'In Progress' && nextStatus !== 'Review') return null
  const noDeadline = !deadlineDateKey(task.deadline)
  const noOwner = !task.primary_owner_id
  if (noDeadline && noOwner) return 'This task has no deadline and no owner yet. Ask your lead to set both so it shows up in Upcoming and does not get lost.'
  if (noDeadline) return 'This task has no deadline yet. Ask your lead to set one so it shows up in Upcoming.'
  if (noOwner) return 'Nobody owns this task yet. Ask your lead to assign it.'
  return null
}

/** A note for a date that has already passed (the task will show as overdue the moment it is saved). */
export function pastDateNote(dateKey: string | null, status: string): string | null {
  if (!dateKey || status === 'Complete') return null
  return dateKey < todayDateKey() ? 'That date has already passed, so this task now shows as overdue.' : null
}

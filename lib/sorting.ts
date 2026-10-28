import type { Task } from '@/types/database'

// The "General" subsystem (migration 0047): the home for team-wide tasks that do not belong to one subsystem. Everyone
// can see and pick up its tasks. It is an ordinary subsystems row with this id.
export const GENERAL_SUBSYSTEM_ID = 'general'
export const isGeneralSubsystem = (id: string | null | undefined): boolean => id === GENERAL_SUBSYSTEM_ID

/**
 * The dashboard's subsystem cards leave General out until it has at least one task: an empty "General, no tasks yet" card
 * is just noise on a team that has not started using it. Every other subsystem always shows, even with no tasks.
 */
export function withoutEmptyGeneral<T extends { id: string; total: number }>(subsystems: T[]): T[] {
  return subsystems.filter((s) => !(isGeneralSubsystem(s.id) && s.total === 0))
}

// ---------------------------------------------------------
// "Needs sorting": open tasks with no category, in any subsystem except General (a General task is already where it
// belongs). Each can be sorted two ways: into a category of its own subsystem (that subsystem's lead or cto/admin), or
// moved to another subsystem, General included (cto/admin only: the database refuses anyone else).
// ---------------------------------------------------------
export interface SortingCategory {
  id: string
  name: string
  subsystem_id: string
}

export interface SortingSubsystem {
  id: string
  name: string
}

export type MoveTarget = { kind: 'category'; id: string } | { kind: 'subsystem'; id: string }

export const encodeMove = (t: MoveTarget): string => `${t.kind}:${t.id}`

export function parseMove(value: string): MoveTarget | null {
  const i = value.indexOf(':')
  if (i < 0) return null
  const kind = value.slice(0, i)
  const id = value.slice(i + 1)
  if (!id || (kind !== 'category' && kind !== 'subsystem')) return null
  return { kind, id }
}

/** The task column to change for a chosen target. A subsystem move leaves the category empty (it belonged to the old one). */
export function moveToPatch(target: MoveTarget): { category_id: string } | { subsystem_id: string; category_id: null } {
  return target.kind === 'category' ? { category_id: target.id } : { subsystem_id: target.id, category_id: null }
}

export interface MoveOption {
  value: string
  label: string
}

/**
 * What one task can be sorted into: the categories of ITS subsystem, and (cto/admin only) every other subsystem, with
 * General listed first because it is the usual answer for a task that fits nowhere.
 */
export function moveOptions(
  task: Pick<Task, 'subsystem_id'>,
  categories: SortingCategory[],
  subsystems: SortingSubsystem[],
  canMoveSubsystem: boolean
): { categories: MoveOption[]; subsystems: MoveOption[] } {
  const cats = categories
    .filter((c) => c.subsystem_id === task.subsystem_id)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ value: encodeMove({ kind: 'category', id: c.id }), label: c.name }))
  const subs = canMoveSubsystem
    ? subsystems
        .filter((s) => s.id !== task.subsystem_id)
        .sort((a, b) => Number(isGeneralSubsystem(b.id)) - Number(isGeneralSubsystem(a.id)) || a.name.localeCompare(b.name))
        .map((s) => ({ value: encodeMove({ kind: 'subsystem', id: s.id }), label: s.name }))
    : []
  return { categories: cats, subsystems: subs }
}

/** Title / subsystem / owner search, every word must match. */
export function sortingMatches(task: Pick<Task, 'title' | 'subsystem' | 'primary_owner'>, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = [task.title, task.subsystem?.name, task.primary_owner?.display_name, task.primary_owner?.email].map((f) => (f ?? '').toLowerCase()).join(' \n ')
  return words.every((w) => haystack.includes(w))
}

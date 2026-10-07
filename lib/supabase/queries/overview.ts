import type { SupabaseClient } from '@supabase/supabase-js'
import { deadlineDateKey, formatDeadline, isDeadlineDueSoon, isDeadlineOverdue, todayDateKey } from '@/lib/deadline'
import { formatDate } from '@/lib/format'
import { listCalendarEventsInRange, listMilestonesInRange } from './calendar'
import { listSubsystems } from './subsystems'

export interface SubsystemProgress {
  id: string
  name: string
  total: number
  complete: number
  open: number
  overdue: number
  noDeadline: number
  blocked: number
  unassigned: number
  overdueUnassigned: number
  leads: { id: string; name: string; avatarUrl: string | null }[]
}

export interface UpcomingItem {
  key: string
  kind: 'overdue' | 'task' | 'event' | 'milestone'
  title: string
  detail: string
  href: string
  sortKey: string
}

export interface TeamCounts {
  open: number
  complete: number
  overdue: number
  dueSoon: number
  blocked: number
  noDeadline: number
  unassigned: number
  overdueUnassigned: number
  overdueSubsystems: number
}

export interface TeamOverview {
  subsystems: SubsystemProgress[]
  counts: TeamCounts
  upcoming: UpcomingItem[]
}

type TaskRow = { id: string; title: string; status: string; deadline: string | null; subsystem_id: string; primary_owner_id: string | null }
type LeadRow = { subsystem_id: string; user: { id: string; display_name: string | null; email: string | null; avatar_url: string | null } | null }

const UPCOMING_DAYS = 14
const UPCOMING_LIMIT = 7
const OVERDUE_LIMIT = 3
const TASK_LIMIT = 2000

function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

// Everything the dashboard's team-level widgets need, from rows the viewer's own RLS already lets them read.
// `restrictToTaskIds` narrows the "upcoming" feed to the viewer's own tasks (members/leads); the progress grid and
// counts are always the whole team's, since every approved member can read all tasks.
export async function getTeamOverview(supabase: SupabaseClient, opts: { restrictToTaskIds?: Set<string> } = {}): Promise<TeamOverview> {
  const today = todayDateKey()
  const horizon = addDays(today, UPCOMING_DAYS)
  const startIso = new Date().toISOString()
  const endIso = new Date(Date.now() + UPCOMING_DAYS * 86400000).toISOString()

  const [subsystems, tasksRes, leadsRes, events, milestones] = await Promise.all([
    listSubsystems(supabase),
    supabase.from('tasks').select('id, title, status, deadline, subsystem_id, primary_owner_id').limit(TASK_LIMIT),
    supabase.from('subsystem_members').select('subsystem_id, user:profiles(id, display_name, email, avatar_url)').eq('is_lead', true),
    listCalendarEventsInRange(supabase, startIso, endIso).catch(() => []),
    listMilestonesInRange(supabase, today, horizon).catch(() => []),
  ])
  if (tasksRes.error) throw tasksRes.error

  const tasks = (tasksRes.data ?? []) as TaskRow[]
  const leadRows = (leadsRes.data ?? []) as unknown as LeadRow[]

  const bySubsystem = new Map<string, SubsystemProgress>()
  for (const s of subsystems) {
    bySubsystem.set(s.id, { id: s.id, name: s.name, total: 0, complete: 0, open: 0, overdue: 0, noDeadline: 0, blocked: 0, unassigned: 0, overdueUnassigned: 0, leads: [] })
  }
  for (const l of leadRows) {
    const entry = bySubsystem.get(l.subsystem_id)
    if (entry && l.user) entry.leads.push({ id: l.user.id, name: l.user.display_name || l.user.email || 'Lead', avatarUrl: l.user.avatar_url })
  }

  const counts: TeamCounts = { open: 0, complete: 0, overdue: 0, dueSoon: 0, blocked: 0, noDeadline: 0, unassigned: 0, overdueUnassigned: 0, overdueSubsystems: 0 }
  for (const t of tasks) {
    const entry = bySubsystem.get(t.subsystem_id)
    if (entry) entry.total += 1
    if (t.status === 'Complete') {
      counts.complete += 1
      if (entry) entry.complete += 1
      continue
    }
    counts.open += 1
    if (entry) entry.open += 1
    if (t.status === 'Blocked') {
      counts.blocked += 1
      if (entry) entry.blocked += 1
    }
    const unowned = !t.primary_owner_id
    if (unowned) {
      counts.unassigned += 1
      if (entry) entry.unassigned += 1
    }
    if (!deadlineDateKey(t.deadline)) {
      counts.noDeadline += 1
      if (entry) entry.noDeadline += 1
    } else if (isDeadlineOverdue(t.deadline, t.status)) {
      counts.overdue += 1
      if (entry) entry.overdue += 1
      if (unowned) {
        counts.overdueUnassigned += 1
        if (entry) entry.overdueUnassigned += 1
      }
    } else if (isDeadlineDueSoon(t.deadline, t.status, 7)) {
      counts.dueSoon += 1
    }
  }

  const subsystemList = [...bySubsystem.values()].sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.name.localeCompare(b.name))
  counts.overdueSubsystems = subsystemList.filter((s) => s.overdue > 0).length

  const visible = (id: string) => !opts.restrictToTaskIds || opts.restrictToTaskIds.has(id)
  const upcoming: UpcomingItem[] = []

  const overdueTasks = tasks
    .filter((t) => visible(t.id) && isDeadlineOverdue(t.deadline, t.status))
    .sort((a, b) => (deadlineDateKey(a.deadline) ?? '').localeCompare(deadlineDateKey(b.deadline) ?? ''))
    .slice(0, OVERDUE_LIMIT)
  for (const t of overdueTasks) {
    upcoming.push({ key: `o-${t.id}`, kind: 'overdue', title: t.title, detail: `was due ${formatDeadline(t.deadline, { month: 'short', day: 'numeric' })}`, href: `/tasks/${t.id}`, sortKey: '0000' })
  }

  const dated: UpcomingItem[] = []
  for (const t of tasks) {
    const key = deadlineDateKey(t.deadline)
    if (!key || t.status === 'Complete' || !visible(t.id)) continue
    if (key >= today && key <= horizon) dated.push({ key: `t-${t.id}`, kind: 'task', title: t.title, detail: `Due ${formatDeadline(t.deadline, { month: 'short', day: 'numeric' })}`, href: `/tasks/${t.id}`, sortKey: key })
  }
  for (const e of events) {
    dated.push({ key: `e-${e.id}`, kind: 'event', title: e.title, detail: formatDate(e.start_time, { month: 'short', day: 'numeric' }), href: '/calendar', sortKey: e.start_time.slice(0, 10) })
  }
  for (const m of milestones) {
    dated.push({ key: `m-${m.id}`, kind: 'milestone', title: m.name, detail: `Milestone, ${formatDeadline(m.date, { month: 'short', day: 'numeric' })}`, href: '/calendar', sortKey: m.date.slice(0, 10) })
  }
  dated.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  upcoming.push(...dated.slice(0, Math.max(0, UPCOMING_LIMIT - upcoming.length)))

  return { subsystems: subsystemList, counts, upcoming }
}

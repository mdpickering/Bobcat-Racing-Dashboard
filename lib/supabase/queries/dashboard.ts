import type { SupabaseClient } from '@supabase/supabase-js'
import type { Profile } from '@/types/user'
import type { Task, AppNotification, CompetitionSettings, SubsystemMember, TaskRequest } from '@/types/database'
import { listNotifications, countUnreadNotifications } from './notifications'
import { getCurrentCompetitionSettings } from './competition'
import { isCtoOrAdmin, isTeamLead } from '@/lib/permissions/roles'
import { isDeadlineOverdue, isDeadlineDueSoon } from '@/lib/deadline'

const TASK_SELECT = `
  *,
  subsystem:subsystems(id, name),
  category:subsystem_categories(id, name),
  primary_owner:profiles!tasks_primary_owner_id_fkey(id, display_name, email, avatar_url)
`

export interface DashboardData {
  assignedTasks: Task[]
  primaryTasks: Task[]
  coOwnedTasks: Task[]
  overdueTasks: Task[]
  dueSoonTasks: Task[]
  blockedTasks: Task[]
  reviewTasks: Task[]
  mySubsystems: SubsystemMember[]
  notifications: AppNotification[]
  unreadNotificationCount: number
  competition: CompetitionSettings | null
  pendingPurchaseCount: number
  leadPendingTaskRequests: TaskRequest[]
  orgPendingCounts: { taskRequests: number; purchaseRequests: number; memberApplications: number; migrationExceptions: number } | null
}

export async function getDashboardData(supabase: SupabaseClient, profile: Profile): Promise<DashboardData> {
  const [assigneeRows, mySubsystems, notifications, unreadNotificationCount, competition] = await Promise.all([
    supabase
      .from('task_assignees')
      .select(`role, task:tasks(${TASK_SELECT})`)
      .eq('user_id', profile.id),
    supabase
      .from('subsystem_members')
      .select('*, subsystem:subsystems(id, name, active)')
      .eq('user_id', profile.id),
    listNotifications(supabase, 8),
    countUnreadNotifications(supabase),
    getCurrentCompetitionSettings(supabase),
  ])

  if (assigneeRows.error) throw assigneeRows.error
  if (mySubsystems.error) throw mySubsystems.error

  type AssigneeRow = { role: 'primary' | 'co_owner'; task: Task | null }
  const rows = ((assigneeRows.data ?? []) as unknown as AssigneeRow[]).filter((r) => r.task)
  const assignedTasks = rows.map((r) => r.task as Task)
  const primaryTasks = rows.filter((r) => r.role === 'primary').map((r) => r.task as Task)
  const coOwnedTasks = rows.filter((r) => r.role === 'co_owner').map((r) => r.task as Task)

  // Deadlines are date-only: compare calendar dates, not timestamps (see lib/deadline.ts).
  const overdueTasks = assignedTasks.filter((t) => isDeadlineOverdue(t.deadline, t.status))
  const dueSoonTasks = assignedTasks.filter((t) => isDeadlineDueSoon(t.deadline, t.status, 7))
  const blockedTasks = assignedTasks.filter((t) => t.status === 'Blocked')
  const reviewTasks = assignedTasks.filter((t) => t.status === 'Review')

  const mySubsystemIds = ((mySubsystems.data ?? []) as unknown as SubsystemMember[]).map((m) => m.subsystem_id)

  let pendingPurchaseCount = 0
  if (mySubsystemIds.length > 0) {
    const { count } = await supabase
      .from('purchase_requests')
      .select('id', { count: 'exact', head: true })
      .in('subsystem_id', mySubsystemIds)
      .in('status', ['Submitted', 'Under Review'])
    pendingPurchaseCount = count ?? 0
  }

  let leadPendingTaskRequests: TaskRequest[] = []
  if (isTeamLead(profile) && mySubsystemIds.length > 0) {
    const { data } = await supabase
      .from('task_requests')
      .select('*, requester:profiles!task_requests_requester_id_fkey(id, display_name, email), subsystem:subsystems(id, name)')
      .in('subsystem_id', mySubsystemIds)
      .eq('status', 'pending')
    leadPendingTaskRequests = (data ?? []) as unknown as TaskRequest[]
  }

  let orgPendingCounts: DashboardData['orgPendingCounts'] = null
  if (isCtoOrAdmin(profile)) {
    const [taskRequests, purchaseRequests, memberApplications, migrationExceptions] = await Promise.all([
      supabase.from('task_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('purchase_requests').select('id', { count: 'exact', head: true }).in('status', ['Submitted', 'Under Review']),
      supabase.from('member_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('migration_exceptions').select('id', { count: 'exact', head: true }).eq('resolution_status', 'unresolved'),
    ])
    orgPendingCounts = {
      taskRequests: taskRequests.count ?? 0,
      purchaseRequests: purchaseRequests.count ?? 0,
      memberApplications: memberApplications.count ?? 0,
      migrationExceptions: migrationExceptions.count ?? 0,
    }
  }

  return {
    assignedTasks,
    primaryTasks,
    coOwnedTasks,
    overdueTasks,
    dueSoonTasks,
    blockedTasks,
    reviewTasks,
    mySubsystems: (mySubsystems.data ?? []) as unknown as SubsystemMember[],
    notifications,
    unreadNotificationCount,
    competition,
    pendingPurchaseCount,
    leadPendingTaskRequests,
    orgPendingCounts,
  }
}

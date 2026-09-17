import { createClient } from '@/lib/supabase/server'
import { getDashboardData } from '@/lib/supabase/queries/dashboard'
import { isCtoOrAdmin, isTeamLead } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'
import StatCard from '@/components/dashboard/StatCard'
import TaskListWidget from '@/components/dashboard/TaskListWidget'
import CompetitionCountdown from '@/components/dashboard/CompetitionCountdown'
import SubsystemInfoWidget from '@/components/dashboard/SubsystemInfoWidget'
import NotificationsWidget from '@/components/dashboard/NotificationsWidget'
import PendingRequestsWidget from '@/components/dashboard/PendingRequestsWidget'
import OrgPendingWidget from '@/components/dashboard/OrgPendingWidget'
import ErrorState from '@/components/ui/ErrorState'
import { AlertTriangle, Clock, ShieldAlert, Eye, ShoppingCart, ListChecks } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()

  if (!profile) return <ErrorState message="Could not load your profile." />

  let data
  try {
    data = await getDashboardData(supabase, profile as Profile)
  } catch {
    return <ErrorState message="Could not load your dashboard right now." />
  }

  const p = profile as Profile
  const lead = isTeamLead(p)
  const admin = isCtoOrAdmin(p)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-text-primary">
          Welcome back, {p.display_name || p.email?.split('@')[0]}
        </h1>
        <p className="mt-0.5 text-xs font-mono text-text-muted">
          {admin ? 'Full operational overview' : lead ? 'Your tasks and subsystem overview' : "Here's what's on your plate"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Assigned Tasks" value={data.assignedTasks.length} icon={ListChecks} href="/tasks" />
        <StatCard label="Overdue" value={data.overdueTasks.length} icon={AlertTriangle} tone="danger" href="/tasks" />
        <StatCard label="Due Soon" value={data.dueSoonTasks.length} icon={Clock} tone="warning" href="/tasks" />
        <StatCard label="Blocked" value={data.blockedTasks.length} icon={ShieldAlert} tone="danger" href="/tasks" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <TaskListWidget
            title="Overdue Tasks"
            tasks={data.overdueTasks}
            emptyMessage="Nothing overdue — nice work."
            viewAllHref="/tasks"
          />
          <TaskListWidget
            title="Due Soon"
            tasks={data.dueSoonTasks}
            emptyMessage="Nothing due in the next 7 days."
            viewAllHref="/tasks"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TaskListWidget title="Blocked" tasks={data.blockedTasks} emptyMessage="No blocked tasks." />
            <TaskListWidget title="In Review" tasks={data.reviewTasks} emptyMessage="Nothing awaiting review." />
          </div>

          {lead && data.leadPendingTaskRequests.length > 0 && (
            <PendingRequestsWidget requests={data.leadPendingTaskRequests} />
          )}
          {admin && data.orgPendingCounts && <OrgPendingWidget counts={data.orgPendingCounts} />}
        </div>

        <div className="space-y-4">
          <CompetitionCountdown competition={data.competition} />
          {data.pendingPurchaseCount > 0 && (
            <a
              href="/purchasing"
              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-xs transition-colors hover:border-accent-blue/40"
            >
              <ShoppingCart size={16} className="text-accent-blue" />
              <span className="text-text-secondary">
                <strong className="text-text-primary">{data.pendingPurchaseCount}</strong> purchase request
                {data.pendingPurchaseCount === 1 ? '' : 's'} awaiting review in your subsystem
                {data.mySubsystems.length === 1 ? '' : 's'}
              </span>
            </a>
          )}
          <SubsystemInfoWidget memberships={data.mySubsystems} />
          <NotificationsWidget notifications={data.notifications} />
        </div>
      </div>

      {data.primaryTasks.length + data.coOwnedTasks.length === 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border p-4 text-xs text-text-muted">
          <Eye size={16} />
          You&apos;re not currently assigned to any tasks. Browse the{' '}
          <a href="/tasks" className="text-accent-blue hover:underline">
            task board
          </a>{' '}
          to see what your subsystem is working on.
        </div>
      )}
    </div>
  )
}

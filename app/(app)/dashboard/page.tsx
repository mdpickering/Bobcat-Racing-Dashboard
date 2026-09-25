import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDashboardData } from '@/lib/supabase/queries/dashboard'
import { isCtoOrAdmin, isTeamLead } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'
import PageHeader from '@/components/ui/PageHeader'
import SectionHeader from '@/components/ui/SectionHeader'
import MetricStrip from '@/components/ui/MetricStrip'
import Panel from '@/components/ui/Panel'
import ErrorState from '@/components/ui/ErrorState'
import TaskGroup from '@/components/dashboard/TaskListWidget'
import CompetitionCountdown from '@/components/dashboard/CompetitionCountdown'
import SubsystemInfoWidget from '@/components/dashboard/SubsystemInfoWidget'
import NotificationsWidget from '@/components/dashboard/NotificationsWidget'
import PendingRequestsWidget from '@/components/dashboard/PendingRequestsWidget'
import OrgPendingWidget from '@/components/dashboard/OrgPendingWidget'
import PurchasingWidget from '@/components/dashboard/PurchasingWidget'

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

  // a task is shown once, in its most urgent group
  const overdueIds = new Set(data.overdueTasks.map((t) => t.id))
  const dueSoon = data.dueSoonTasks.filter((t) => !overdueIds.has(t.id))
  const shown = new Set([...overdueIds, ...dueSoon.map((t) => t.id)])
  const blocked = data.blockedTasks.filter((t) => !shown.has(t.id))
  blocked.forEach((t) => shown.add(t.id))
  const inReview = data.reviewTasks.filter((t) => !shown.has(t.id))
  const attentionCount = data.overdueTasks.length + dueSoon.length + blocked.length + inReview.length

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`Welcome back, ${p.display_name || p.email?.split('@')[0]}`}
        description={admin ? 'Full operational overview' : lead ? 'Your tasks and subsystem overview' : "Here's what's on your plate"}
      />

      <MetricStrip
        className="mb-6"
        metrics={[
          { label: 'Assigned to me', value: String(data.assignedTasks.length), hint: data.coOwnedTasks.length > 0 ? `${data.coOwnedTasks.length} co-owned` : undefined, href: '/tasks' },
          { label: 'Overdue', value: String(data.overdueTasks.length), tone: data.overdueTasks.length > 0 ? 'danger' : undefined, href: '/tasks' },
          { label: 'Due in 7 days', value: String(data.dueSoonTasks.length), tone: data.dueSoonTasks.length > 0 ? 'warning' : undefined, href: '/tasks' },
          { label: 'Blocked', value: String(data.blockedTasks.length), tone: data.blockedTasks.length > 0 ? 'danger' : undefined, href: '/tasks' },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section aria-label="Needs attention">
            <SectionHeader
              title="Needs your attention"
              actions={
                <Link href="/tasks" className="text-xs text-accent-blue hover:underline">
                  All my tasks
                </Link>
              }
            />
            {attentionCount === 0 ? (
              <Panel className="p-4 text-xs text-text-secondary">
                {data.assignedTasks.length === 0 ? (
                  <>
                    You are not assigned to any tasks yet. Browse your{' '}
                    <Link href="/subsystems" className="text-accent-blue hover:underline">
                      subsystem
                    </Link>{' '}
                    to see what the team is working on.
                  </>
                ) : (
                  'Nothing is overdue, due this week, blocked or waiting on review.'
                )}
              </Panel>
            ) : (
              <div className="space-y-4">
                {data.overdueTasks.length > 0 && <TaskGroup title="Overdue" tasks={data.overdueTasks} viewAllHref="/tasks" />}
                {dueSoon.length > 0 && <TaskGroup title="Due in the next 7 days" tasks={dueSoon} viewAllHref="/tasks" />}
                {blocked.length > 0 && <TaskGroup title="Blocked" tasks={blocked} />}
                {inReview.length > 0 && <TaskGroup title="In review" tasks={inReview} />}
              </div>
            )}
          </section>

          {lead && data.leadPendingTaskRequests.length > 0 && <PendingRequestsWidget requests={data.leadPendingTaskRequests} />}
          {admin && data.orgPendingCounts && <OrgPendingWidget counts={data.orgPendingCounts} />}
        </div>

        <aside aria-label="Season and activity">
          <Panel className="divide-y divide-border">
            <div className="p-4">
              <SectionHeader title="Season" />
              <CompetitionCountdown competition={data.competition} />
            </div>
            <div className="p-4">
              <SectionHeader title="Your subsystems" />
              <SubsystemInfoWidget memberships={data.mySubsystems} />
              {data.pendingPurchaseCount > 0 && (
                <div className="mt-3 border-t border-border pt-3">
                  <PurchasingWidget pendingCount={data.pendingPurchaseCount} subsystemCount={data.mySubsystems.length} />
                </div>
              )}
            </div>
            <div className="p-4">
              <SectionHeader title="Notifications" />
              <NotificationsWidget notifications={data.notifications} />
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  )
}

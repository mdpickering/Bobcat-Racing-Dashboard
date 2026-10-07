import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDashboardData } from '@/lib/supabase/queries/dashboard'
import { getTeamOverview, type TeamOverview } from '@/lib/supabase/queries/overview'
import { canManageOperations, isCtoOrAdmin, isTeamLead } from '@/lib/permissions/roles'
import { daysUntil } from '@/lib/format'
import type { Profile } from '@/types/user'
import PageHeader from '@/components/ui/PageHeader'
import SectionHeader from '@/components/ui/SectionHeader'
import Panel from '@/components/ui/Panel'
import ErrorState from '@/components/ui/ErrorState'
import TaskGroup from '@/components/dashboard/TaskListWidget'
import CompetitionCountdown from '@/components/dashboard/CompetitionCountdown'
import SubsystemInfoWidget from '@/components/dashboard/SubsystemInfoWidget'
import NotificationsWidget from '@/components/dashboard/NotificationsWidget'
import PendingRequestsWidget from '@/components/dashboard/PendingRequestsWidget'
import OrgPendingWidget from '@/components/dashboard/OrgPendingWidget'
import PurchasingWidget from '@/components/dashboard/PurchasingWidget'
import KpiCard from '@/components/dashboard/KpiCard'
import PlanningGapsWidget from '@/components/dashboard/PlanningGapsWidget'
import SubsystemProgressGrid from '@/components/dashboard/SubsystemProgressGrid'
import UpcomingTimeline from '@/components/dashboard/UpcomingTimeline'

export const metadata = { title: 'Dashboard' }

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
  // Admin, CTO and COO run the whole team, so their headline figures are the team's; everyone else sees their own.
  const teamWide = canManageOperations(p)

  // The team widgets are an extra, not the page: if they fail to load the rest of the dashboard still renders.
  let overview: TeamOverview | null = null
  try {
    overview = await getTeamOverview(supabase, teamWide ? {} : { restrictToTaskIds: new Set(data.assignedTasks.map((t) => t.id)) })
  } catch {
    overview = null
  }

  // a task is shown once, in its most urgent group
  const overdueIds = new Set(data.overdueTasks.map((t) => t.id))
  const dueSoon = data.dueSoonTasks.filter((t) => !overdueIds.has(t.id))
  const shown = new Set([...overdueIds, ...dueSoon.map((t) => t.id)])
  const blocked = data.blockedTasks.filter((t) => !shown.has(t.id))
  blocked.forEach((t) => shown.add(t.id))
  const inReview = data.reviewTasks.filter((t) => !shown.has(t.id))
  const attentionCount = data.overdueTasks.length + dueSoon.length + blocked.length + inReview.length

  // Who can act on planning gaps: the team-wide roles (for every subsystem, via the Deadlines page) and a lead (for
  // their own subsystem). Everyone else is not shown the card, since they could not fix anything it lists.
  const ledIds = new Set(data.mySubsystems.filter((m) => m.is_lead).map((m) => m.subsystem_id))
  let planning: { rows: { label: string; count: number; href: string; tone: 'warning' | 'danger' }[]; scopeLabel: string } | null = null
  if (overview && (teamWide || ledIds.size > 0)) {
    const scope = teamWide ? overview.subsystems : overview.subsystems.filter((s) => ledIds.has(s.id))
    const sum = (pick: (s: (typeof scope)[number]) => number) => scope.reduce((n, s) => n + pick(s), 0)
    const leadHref = ledIds.size === 1 ? `/subsystems/${[...ledIds][0]}` : '/subsystems'
    planning = {
      scopeLabel: teamWide ? 'Across every subsystem.' : ledIds.size === 1 ? 'In the subsystem you lead.' : 'In the subsystems you lead.',
      rows: [
        { label: 'Overdue and nobody owns them', count: sum((s) => s.overdueUnassigned), href: teamWide ? '/operations/deadlines?range=overdue&owner=none' : leadHref, tone: 'danger' },
        { label: 'Open tasks with no owner', count: sum((s) => s.unassigned), href: teamWide ? '/operations/deadlines?owner=none' : leadHref, tone: 'warning' },
        { label: 'Open tasks with no deadline', count: sum((s) => s.noDeadline), href: teamWide ? '/operations/deadlines?range=none' : leadHref, tone: 'warning' },
      ],
    }
  }

  const daysToCompetition = daysUntil(data.competition?.competition_date)
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={`Welcome back, ${p.display_name || p.email?.split('@')[0]}`}
        description={admin ? 'Full operational overview' : lead ? 'Your tasks and subsystem overview' : "Here's what's on your plate"}
      />

      <section aria-label="Key figures" className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {teamWide && overview ? (
          <>
            <KpiCard
              label="Overdue tasks"
              value={String(overview.counts.overdue)}
              tone={overview.counts.overdue > 0 ? 'danger' : undefined}
              hint={overview.counts.overdue > 0 ? `In ${plural(overview.counts.overdueSubsystems, 'subsystem')}` : 'Everything on time'}
              hintTone={overview.counts.overdue > 0 ? 'danger' : 'success'}
              href="/operations/deadlines"
            />
            <KpiCard
              label="Due in 7 days"
              value={String(overview.counts.dueSoon)}
              tone={overview.counts.dueSoon > 0 ? 'warning' : undefined}
              hint={`${overview.counts.noDeadline} undated task${overview.counts.noDeadline === 1 ? '' : 's'}`}
              hintTone={overview.counts.noDeadline > 0 ? 'warning' : 'neutral'}
              href="/operations/deadlines"
            />
            <KpiCard
              label="Blocked"
              value={String(overview.counts.blocked)}
              tone={overview.counts.blocked > 0 ? 'danger' : undefined}
              hint={overview.counts.blocked > 0 ? 'Needs unblocking' : 'Nothing blocked'}
              hintTone={overview.counts.blocked > 0 ? 'danger' : 'success'}
            />
            <KpiCard
              label="Days to competition"
              value={daysToCompetition !== null ? String(Math.max(daysToCompetition, 0)) : '—'}
              hint={data.competition?.competition_name || (data.competition ? `${data.competition.season} competition` : 'Not configured')}
              hintTone="brand"
            />
          </>
        ) : (
          <>
            <KpiCard
              label="Assigned to me"
              value={String(data.assignedTasks.length)}
              hint={data.coOwnedTasks.length > 0 ? `${data.coOwnedTasks.length} co-owned` : undefined}
              href="/tasks"
            />
            <KpiCard
              label="Overdue"
              value={String(data.overdueTasks.length)}
              tone={data.overdueTasks.length > 0 ? 'danger' : undefined}
              hint={data.overdueTasks.length > 0 ? 'Needs your attention' : 'Nothing overdue'}
              hintTone={data.overdueTasks.length > 0 ? 'danger' : 'success'}
              href="/tasks"
            />
            <KpiCard
              label="Due in 7 days"
              value={String(data.dueSoonTasks.length)}
              tone={data.dueSoonTasks.length > 0 ? 'warning' : undefined}
              hint="Next 7 days"
              href="/tasks"
            />
            <KpiCard
              label="Blocked"
              value={String(data.blockedTasks.length)}
              tone={data.blockedTasks.length > 0 ? 'danger' : undefined}
              hint={data.blockedTasks.length > 0 ? 'Needs unblocking' : 'Nothing blocked'}
              hintTone={data.blockedTasks.length > 0 ? 'danger' : 'success'}
              href="/tasks"
            />
          </>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {overview && (
            <section aria-label="Subsystem progress">
              <SectionHeader
                title="Subsystem progress"
                description="Finished tasks out of all tasks, with what needs action."
                actions={
                  <Link href="/subsystems" className="touch-target inline-flex items-center text-xs text-accent-blue hover:underline">
                    All subsystems
                  </Link>
                }
              />
              <SubsystemProgressGrid subsystems={overview.subsystems} />
            </section>
          )}

          {planning && <PlanningGapsWidget rows={planning.rows} scopeLabel={planning.scopeLabel} />}

          <section aria-label="Needs attention">
            <SectionHeader
              title="Needs your attention"
              actions={
                <Link href="/tasks" className="touch-target inline-flex items-center text-xs text-accent-blue hover:underline">
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

        <aside aria-label="Upcoming, season and activity" className="space-y-6">
          {overview && (
            <Panel className="p-4">
              <SectionHeader
                title="Upcoming"
                actions={
                  <Link href="/calendar" className="touch-target inline-flex items-center text-xs text-accent-blue hover:underline">
                    Calendar
                  </Link>
                }
              />
              <UpcomingTimeline items={overview.upcoming} />
            </Panel>
          )}

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

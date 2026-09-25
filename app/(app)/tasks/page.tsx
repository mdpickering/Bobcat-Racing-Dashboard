import { createClient } from '@/lib/supabase/server'
import { listTasks, listTaskRequests } from '@/lib/supabase/queries/tasks'
import { listSubsystems } from '@/lib/supabase/queries/subsystems'
import { isCtoOrAdmin, canReviewTaskRequest } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'
import type { SubsystemCategory } from '@/types/database'
import TaskFilters from '@/components/tasks/TaskFilters'
import TaskList from '@/components/tasks/TaskList'
import TasksToolbar from '@/components/tasks/TasksToolbar'
import TaskRequestsList from '@/components/tasks/TaskRequestsList'
import ErrorState from '@/components/ui/ErrorState'
import PageHeader from '@/components/ui/PageHeader'
import Tabs from '@/components/ui/Tabs'

export default async function TasksPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined }
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  const profile = profileRow as Profile

  const [subsystems, { data: categoriesData }, { data: leadRows }] = await Promise.all([
    listSubsystems(supabase),
    supabase.from('subsystem_categories').select('*').eq('active', true),
    supabase.from('subsystem_members').select('subsystem_id').eq('user_id', profile.id).eq('is_lead', true),
  ])
  const categories = (categoriesData ?? []) as SubsystemCategory[]
  const ledSubsystemIds = new Set((leadRows ?? []).map((r) => r.subsystem_id as string))
  const isAnySubsystemLead = ledSubsystemIds.size > 0
  const admin = isCtoOrAdmin(profile)
  const canCreate = admin || isAnySubsystemLead
  // tasks_insert requires cto/admin or lead of that specific subsystem, so
  // the create form only offers those; the request form and filters keep
  // the full list (any approved user may request a task for any subsystem).
  const createSubsystems = admin ? subsystems : subsystems.filter((s) => ledSubsystemIds.has(s.id))
  // Approving/declining a task request is narrower than creating a task: cto/admin, or a
  // profile-role team lead for the subsystems they lead. A member flagged as a subsystem
  // lead can create tasks there but cannot review requests (see can_review_task_request).
  const reviewableSubsystemIds = subsystems
    .filter((s) => canReviewTaskRequest(profile, ledSubsystemIds, s.id))
    .map((s) => s.id)

  const tab = searchParams.tab === 'requests' ? 'requests' : 'board'

  if (tab === 'requests') {
    let requests
    try {
      requests = await listTaskRequests(supabase)
    } catch {
      return <ErrorState message="Could not load task requests." />
    }
    const pendingCount = requests.filter((r) => r.status === 'pending').length
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Task requests"
          description="Requests submitted by the team, awaiting review."
          actions={<TasksToolbar canCreate={canCreate} subsystems={subsystems} createSubsystems={createSubsystems} categories={categories} />}
        >
          <Tabs
            label="Task views"
            tabs={[
              { label: 'My tasks', href: '/tasks', active: false },
              { label: 'Requests', href: '/tasks?tab=requests', active: true, count: pendingCount > 0 ? pendingCount : undefined },
            ]}
          />
        </PageHeader>
        <TaskRequestsList requests={requests} canReviewAll={admin} reviewableSubsystemIds={reviewableSubsystemIds} />
      </div>
    )
  }

  let tasks
  try {
    // /tasks is each user's own board: only tasks they're assigned to (primary or co-owner),
    // with the existing subsystem/category/priority/status/search filters still applying on top.
    // Browsing everyone else's work for a subsystem happens on that subsystem's own page instead.
    tasks = await listTasks(supabase, {
      assignedUserId: profile.id,
      subsystemId: searchParams.subsystem,
      categoryId: searchParams.category,
      priority: searchParams.priority,
      status: searchParams.status,
      search: searchParams.search,
    })
  } catch {
    return <ErrorState message="Could not load tasks." />
  }

  let pendingRequestCount = 0
  try {
    const requests = await listTaskRequests(supabase)
    pendingRequestCount = requests.filter((r) => r.status === 'pending').length
  } catch {
    // non-fatal — the badge just shows 0
  }

  const filtered = Boolean(searchParams.subsystem || searchParams.category || searchParams.priority || searchParams.status || searchParams.search)

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="My tasks"
        description={`${tasks.length} task${tasks.length === 1 ? '' : 's'} assigned to you${filtered ? ', matching your filters' : ''}. Everyone's work is on each subsystem's page.`}
        actions={<TasksToolbar canCreate={canCreate} subsystems={subsystems} createSubsystems={createSubsystems} categories={categories} />}
      >
        <Tabs
          label="Task views"
          tabs={[
            { label: 'My tasks', href: '/tasks', active: true },
            { label: 'Requests', href: '/tasks?tab=requests', active: false, count: pendingRequestCount > 0 ? pendingRequestCount : undefined },
          ]}
        />
      </PageHeader>
      <div className="mb-4">
        <TaskFilters subsystems={subsystems} categories={categories} />
      </div>
      <TaskList
        tasks={tasks}
        emptyTitle={filtered ? 'No tasks match these filters' : 'No tasks assigned to you'}
        emptyDescription={filtered ? 'Try adjusting or clearing your filters.' : 'Tasks you own or co-own appear here.'}
      />
    </div>
  )
}

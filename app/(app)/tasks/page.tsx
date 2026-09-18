import { createClient } from '@/lib/supabase/server'
import { listTasks, listTaskRequests } from '@/lib/supabase/queries/tasks'
import { listSubsystems } from '@/lib/supabase/queries/subsystems'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'
import type { SubsystemCategory } from '@/types/database'
import TaskFilters from '@/components/tasks/TaskFilters'
import TaskList from '@/components/tasks/TaskList'
import TasksToolbar from '@/components/tasks/TasksToolbar'
import TaskRequestsList from '@/components/tasks/TaskRequestsList'
import ErrorState from '@/components/ui/ErrorState'

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
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-bold text-text-primary">Tasks</h1>
          <p className="mt-0.5 text-xs font-mono text-text-muted">Requests submitted by the team, awaiting review.</p>
        </div>
        <TasksToolbar canCreate={canCreate} subsystems={subsystems} createSubsystems={createSubsystems} categories={categories} activeTab="requests" pendingRequestCount={pendingCount} />
        <TaskRequestsList requests={requests} canReview={canCreate} currentUserId={profile.id} />
      </div>
    )
  }

  let tasks
  try {
    tasks = await listTasks(supabase, {
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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Tasks</h1>
        <p className="mt-0.5 text-xs font-mono text-text-muted">
          {tasks.length} task{tasks.length === 1 ? '' : 's'} matching your filters
        </p>
      </div>
      <TasksToolbar canCreate={canCreate} subsystems={subsystems} createSubsystems={createSubsystems} categories={categories} activeTab="board" pendingRequestCount={pendingRequestCount} />
      <TaskFilters subsystems={subsystems} categories={categories} />
      <TaskList tasks={tasks} />
    </div>
  )
}

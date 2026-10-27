import { createClient } from '@/lib/supabase/server'
import { listUncategorizedTasks } from '@/lib/supabase/queries/tasks'
import { listSubsystems } from '@/lib/supabase/queries/subsystems'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import { sortingMatches, type SortingCategory } from '@/lib/sorting'
import { hitLimit, parseListLimit } from '@/lib/pagination'
import type { Profile } from '@/types/user'
import ErrorState, { PermissionDeniedState } from '@/components/ui/ErrorState'
import FilterBar from '@/components/ui/FilterBar'
import LimitNotice from '@/components/ui/LimitNotice'
import PageHeader from '@/components/ui/PageHeader'
import SortingBoard from '@/components/tasks/SortingBoard'

export const metadata = { title: 'Needs sorting' }

export default async function SortingPage({ searchParams }: { searchParams: { [key: string]: string | undefined } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  if (!profileRow) return <ErrorState message="Could not load your profile." />
  const profile = profileRow as Profile

  const admin = isCtoOrAdmin(profile)
  const { data: leadRows } = await supabase.from('subsystem_members').select('subsystem_id').eq('user_id', profile.id).eq('is_lead', true)
  const ledSubsystemIds = (leadRows ?? []).map((r) => r.subsystem_id as string)
  if (!admin && ledSubsystemIds.length === 0) {
    return <PermissionDeniedState message="Sorting tasks is limited to subsystem leads, the CTO and admins." />
  }

  const limit = parseListLimit(searchParams.limit)
  let tasks, subsystems, categoryRows
  try {
    const [t, s, c] = await Promise.all([
      listUncategorizedTasks(supabase, { subsystemIds: admin ? undefined : ledSubsystemIds, limit }),
      listSubsystems(supabase),
      supabase.from('subsystem_categories').select('id, name, subsystem_id').eq('active', true),
    ])
    if (c.error) throw c.error
    ;[tasks, subsystems, categoryRows] = [t, s, c.data]
  } catch {
    return <ErrorState message="Could not load the tasks that need sorting." />
  }
  const categories = (categoryRows ?? []) as SortingCategory[]

  const q = searchParams.q ?? ''
  const subsystem = searchParams.subsystem ?? ''
  const shown = tasks.filter((t) => (!subsystem || t.subsystem_id === subsystem) && sortingMatches(t, q))
  const isFiltered = Boolean(q.trim() || subsystem)
  const subsystemOptions = Array.from(new Map(tasks.map((t) => [t.subsystem_id, t.subsystem?.name ?? t.subsystem_id])).entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label))

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Needs sorting"
        description={`Open tasks with no category${admin ? '' : ' in the subsystems you lead'}. Give each one a category, or move it to another subsystem. Tasks that fit nowhere belong in General.`}
      />

      <div className="mb-4">
        <FilterBar
          search={{ key: 'q', placeholder: 'Search task, subsystem, owner…' }}
          fields={[{ key: 'subsystem', allLabel: 'All subsystems', className: 'sm:w-48', options: subsystemOptions }]}
        />
      </div>

      <SortingBoard
        tasks={shown}
        categories={categories}
        subsystems={subsystems.map((s) => ({ id: s.id, name: s.name }))}
        canMoveSubsystem={admin}
        isAdmin={admin}
        ledSubsystemIds={ledSubsystemIds}
        filtered={isFiltered}
      />
      {hitLimit(tasks.length, limit) && <LimitNotice noun="tasks" limit={limit} searchParams={searchParams} pathname="/sorting" />}
    </div>
  )
}

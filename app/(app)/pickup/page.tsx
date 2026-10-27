import { HandHelping } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { listMyPickupTasks, listPickupTasks } from '@/lib/supabase/queries/pickup'
import { MAX_PICKUP_TASKS, SIZE_HINT, SIZE_LABEL, TASK_SIZES, isTaskSize, sortPickupTasks } from '@/lib/pickup'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import FilterBar from '@/components/ui/FilterBar'
import PageHeader from '@/components/ui/PageHeader'
import { MyPickupPanel, PickupGrid } from '@/components/pickup/PickupBoard'

export const metadata = { title: 'Pick up a task' }

// Migration 0046 not run yet: PostgREST says "could not find the function" (PGRST202 / 42883), and Postgres says the new
// tasks.size column does not exist (42703).
const isMissingFunction = (e: unknown) => ['PGRST202', '42883', '42703'].includes((e as { code?: string } | null)?.code ?? '')

export default async function PickupPage({ searchParams }: { searchParams: { [key: string]: string | undefined } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let tasks, mine
  try {
    ;[tasks, mine] = await Promise.all([listPickupTasks(supabase), listMyPickupTasks(supabase, user!.id)])
  } catch (e) {
    console.error('pick-up board failed to load', e)
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Pick up a task" description="Small jobs anyone can grab." />
        <ErrorState message={isMissingFunction(e) ? 'The pick-up board is not set up yet. Run migration 0046_pickup_tasks.sql.' : 'Could not load the pick-up board.'} />
      </div>
    )
  }

  const size = isTaskSize(searchParams.size) ? searchParams.size : ''
  const subsystem = searchParams.subsystem ?? ''
  const subsystemOptions = Array.from(new Map(tasks.map((t) => [t.subsystem_id, t.subsystem_name])).entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const filtered = sortPickupTasks(tasks.filter((t) => (!size || t.size === size) && (!subsystem || t.subsystem_id === subsystem)))
  const isFiltered = Boolean(size || subsystem)

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Pick up a task"
        description={`Nothing on your plate? Grab a small job from any subsystem. You can hold up to ${MAX_PICKUP_TASKS} at a time.`}
      />

      <div className="mb-5">
        <MyPickupPanel tasks={mine.map((t) => ({ id: t.id, title: t.title, status: t.status, size: t.size }))} />
      </div>

      <div className="mb-4">
        <FilterBar
          fields={[
            { key: 'size', allLabel: 'All sizes', chips: true, options: TASK_SIZES.map((s) => ({ value: s, label: `${SIZE_LABEL[s]} · ${SIZE_HINT[s].replace('About ', '')}` })) },
            { key: 'subsystem', allLabel: 'All subsystems', className: 'sm:w-48', options: subsystemOptions },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={HandHelping}
          title={isFiltered ? 'No tasks match these filters' : 'Nothing on the board right now'}
          description={isFiltered ? 'Try another size or subsystem.' : 'Check back soon. A subsystem lead, the COO or an admin adds tasks by opening a task and choosing a pick-up size.'}
        />
      ) : (
        <PickupGrid tasks={filtered} openCount={mine.length} />
      )}
    </div>
  )
}

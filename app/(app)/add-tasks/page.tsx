import { createClient } from '@/lib/supabase/server'
import { listSubsystems } from '@/lib/supabase/queries/subsystems'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import { titleKey, type BulkCategory } from '@/lib/bulkTasks'
import { COMPETITION_CHECKLIST_TEXT } from '@/lib/competitionChecklist'
import type { Profile } from '@/types/user'
import ErrorState, { PermissionDeniedState } from '@/components/ui/ErrorState'
import PageHeader from '@/components/ui/PageHeader'
import BulkTaskCreator from '@/components/tasks/BulkTaskCreator'

export const metadata = { title: 'Add several tasks' }

export default async function AddTasksPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  if (!profileRow) return <ErrorState message="Could not load your profile." />
  const profile = profileRow as Profile

  // Adding a task needs cto/admin or the lead of that subsystem (the database enforces the same rule on every insert).
  const admin = isCtoOrAdmin(profile)
  const { data: leadRows } = await supabase.from('subsystem_members').select('subsystem_id').eq('user_id', profile.id).eq('is_lead', true)
  const ledSubsystemIds = (leadRows ?? []).map((r) => r.subsystem_id as string)
  if (!admin && ledSubsystemIds.length === 0) {
    return <PermissionDeniedState message="Adding tasks is limited to subsystem leads, the CTO and admins." />
  }

  let subsystems, categoryRows, taskRows
  try {
    const [s, c, t] = await Promise.all([
      listSubsystems(supabase),
      supabase.from('subsystem_categories').select('id, name, subsystem_id').eq('active', true),
      supabase.from('tasks').select('title, subsystem_id').limit(5000),
    ])
    if (c.error) throw c.error
    if (t.error) throw t.error
    ;[subsystems, categoryRows, taskRows] = [s, c.data, t.data]
  } catch {
    return <ErrorState message="Could not load what the form needs." />
  }

  const existingKeys = (taskRows ?? []).map((t) => titleKey(t.subsystem_id as string, t.title as string))

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Add several tasks" description="Paste a list and create them all at once. Give a task a size and it goes on the Pick up board for anyone to grab." />
      <BulkTaskCreator
        subsystems={subsystems.map((s) => ({ id: s.id, name: s.name }))}
        categories={(categoryRows ?? []) as BulkCategory[]}
        allowedSubsystemIds={admin ? subsystems.map((s) => s.id) : ledSubsystemIds}
        existingKeys={existingKeys}
        checklistText={COMPETITION_CHECKLIST_TEXT}
      />
    </div>
  )
}

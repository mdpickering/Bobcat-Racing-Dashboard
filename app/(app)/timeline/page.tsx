import { createClient } from '@/lib/supabase/server'
import { listTimelineColumns, listTimelineMilestones } from '@/lib/supabase/queries/timeline'
import { listSubsystems } from '@/lib/supabase/queries/subsystems'
import { canManageOperations } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'
import TimelineGrid from '@/components/timeline/TimelineGrid'
import TimelineToolbar from '@/components/timeline/TimelineToolbar'
import ErrorState from '@/components/ui/ErrorState'

export default async function TimelinePage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  const profile = profileRow as Profile
  // The timeline components' "isCtoOrAdmin" prop means "may edit every cell and the column
  // structure", which now also covers the COO (migration 0028).
  const userIsCtoOrAdmin = canManageOperations(profile)

  const [subsystems, { data: leadRows }] = await Promise.all([
    listSubsystems(supabase),
    supabase.from('subsystem_members').select('subsystem_id').eq('user_id', profile.id).eq('is_lead', true),
  ])
  const ledSubsystemIds = new Set((leadRows ?? []).map((r) => r.subsystem_id as string))

  let activeColumns, allColumns, milestones
  try {
    ;[activeColumns, allColumns, milestones] = await Promise.all([
      listTimelineColumns(supabase),
      userIsCtoOrAdmin ? listTimelineColumns(supabase, true) : listTimelineColumns(supabase),
      listTimelineMilestones(supabase),
    ])
  } catch {
    return <ErrorState message="Could not load the timeline." />
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Master Timeline</h1>
        <p className="mt-0.5 text-xs font-mono text-text-muted">Shared build timeline with per-subsystem milestone cells.</p>
      </div>
      <TimelineToolbar isCtoOrAdmin={userIsCtoOrAdmin} allColumns={allColumns} />
      <TimelineGrid columns={activeColumns} subsystems={subsystems} milestones={milestones} canEditSubsystemIds={ledSubsystemIds} isCtoOrAdmin={userIsCtoOrAdmin} />
    </div>
  )
}

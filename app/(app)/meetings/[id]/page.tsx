import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMeetingById, listAgendaItems, listActionItems, listSuggestedTopics, getPreviousMeetingFollowUp } from '@/lib/supabase/queries/meetings'
import { listSubsystems } from '@/lib/supabase/queries/subsystems'
import { canManageMeetings, canRecordMeetingNotes } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'
import ErrorState, { PermissionDeniedState } from '@/components/ui/ErrorState'
import MeetingWorkspace from '@/components/meetings/MeetingWorkspace'

export default async function MeetingDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  if (!profileRow) return <ErrorState message="Could not load your profile." />
  const profile = profileRow as Profile

  let meeting
  try {
    meeting = await getMeetingById(supabase, params.id)
  } catch {
    return <ErrorState message="Could not load this meeting." />
  }
  if (!meeting) notFound()

  const canManage = canManageMeetings(profile)
  const canRecord = canRecordMeetingNotes(profile)
  if (!canRecord && meeting.status !== 'completed') {
    // RLS already hides a planned/in_progress meeting from an ordinary member entirely (getMeetingById
    // would have returned null above) — this only covers the edge case of a stale/shared link.
    return <PermissionDeniedState message="This meeting hasn't been completed yet — only the meeting manager and recorder can see it while it's being prepared or run." />
  }

  const [agendaItems, actionItems, suggestedTopics, previousFollowUp, subsystems, profilesResult] = await Promise.all([
    listAgendaItems(supabase, meeting.id),
    listActionItems(supabase, meeting.id),
    canManage && meeting.status !== 'completed' ? listSuggestedTopics(supabase, meeting) : Promise.resolve([]),
    canManage && meeting.status !== 'completed' ? getPreviousMeetingFollowUp(supabase, meeting.id) : Promise.resolve(null),
    listSubsystems(supabase),
    supabase.from('profiles').select('id, display_name, email').eq('approved', true).eq('active', true).order('display_name'),
  ])

  return (
    <div className="mx-auto max-w-4xl">
      <MeetingWorkspace
        meeting={meeting}
        initialAgendaItems={agendaItems}
        initialActionItems={actionItems}
        suggestedTopics={suggestedTopics}
        previousFollowUp={previousFollowUp}
        subsystems={subsystems}
        assignableProfiles={(profilesResult.data ?? []) as { id: string; display_name: string | null; email: string | null }[]}
        canManage={canManage}
        canRecord={canRecord}
      />
    </div>
  )
}

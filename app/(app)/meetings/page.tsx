import { createClient } from '@/lib/supabase/server'
import { listMeetings } from '@/lib/supabase/queries/meetings'
import { canManageMeetings, canRecordMeetingNotes } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'
import PageHeader from '@/components/ui/PageHeader'
import ErrorState, { PermissionDeniedState } from '@/components/ui/ErrorState'
import MeetingListPanel from '@/components/meetings/MeetingListPanel'
import NewMeetingButton from '@/components/meetings/NewMeetingButton'

export default async function MeetingsPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  if (!profileRow) return <ErrorState message="Could not load your profile." />
  const profile = profileRow as Profile

  if (!canRecordMeetingNotes(profile)) {
    // Ordinary members only ever see a completed meeting's own page (linked from elsewhere, e.g. a
    // notification); the list itself is for the CTO/Admin/COO preparing and running meetings.
    return <PermissionDeniedState message="Technical meetings are managed by the CTO, Admin and COO. Completed meeting notes are available if you're linked to one directly." />
  }

  let meetings
  try {
    meetings = await listMeetings(supabase)
  } catch {
    return <ErrorState message="Could not load technical meetings." />
  }

  const upcoming = meetings.filter((m) => m.status !== 'completed').sort((a, b) => a.meeting_date.localeCompare(b.meeting_date))
  const completed = meetings.filter((m) => m.status === 'completed').sort((a, b) => b.meeting_date.localeCompare(a.meeting_date))

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Technical meetings"
        description="Agenda, discussion notes, decisions and action items for the team's technical meetings."
        actions={canManageMeetings(profile) ? <NewMeetingButton /> : null}
      />
      <MeetingListPanel upcoming={upcoming} completed={completed} />
    </div>
  )
}

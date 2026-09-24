import { createClient } from '@/lib/supabase/server'
import { listCalendarEventsInRange, listMilestonesInRange, listTaskDeadlinesInRange, listRecurringEvents } from '@/lib/supabase/queries/calendar'
import { listSubsystems } from '@/lib/supabase/queries/subsystems'
import { canManageOperations } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'
import MonthCalendar from '@/components/calendar/MonthCalendar'
import RecurringEventsPanel from '@/components/calendar/RecurringEventsPanel'
import CalendarToolbar from '@/components/calendar/CalendarToolbar'
import ErrorState from '@/components/ui/ErrorState'

export default async function CalendarPage({
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

  const now = new Date()
  const year = searchParams.year ? Number(searchParams.year) : now.getFullYear()
  const month = searchParams.month ? Number(searchParams.month) - 1 : now.getMonth()
  const rangeStart = new Date(year, month, 1)
  const rangeEnd = new Date(year, month + 1, 0, 23, 59, 59)
  const rangeStartDate = `${rangeStart.getFullYear()}-${String(rangeStart.getMonth() + 1).padStart(2, '0')}-${String(rangeStart.getDate()).padStart(2, '0')}`
  const rangeEndDate = `${rangeEnd.getFullYear()}-${String(rangeEnd.getMonth() + 1).padStart(2, '0')}-${String(rangeEnd.getDate()).padStart(2, '0')}`
  // Task deadlines are date-only, stored as midnight UTC (see lib/deadline.ts), so the
  // month is selected by UTC bounds. The local-time bounds above would drop a deadline on
  // the 1st (midnight UTC is before local midnight in the US) and pull in the next 1st.
  const deadlineRangeStart = new Date(Date.UTC(year, month, 1)).toISOString()
  const deadlineRangeEnd = new Date(Date.UTC(year, month + 1, 1) - 1).toISOString()

  const [subsystems, { data: leadRows }] = await Promise.all([
    listSubsystems(supabase),
    supabase.from('subsystem_members').select('subsystem_id').eq('user_id', profile.id).eq('is_lead', true),
  ])
  const ledSubsystemIds = new Set((leadRows ?? []).map((r) => r.subsystem_id as string))
  // The calendar components' "isCtoOrAdmin" prop means "may manage the whole team's schedule",
  // which now also covers the COO (migration 0028).
  const userIsCtoOrAdmin = canManageOperations(profile)
  const canManage = userIsCtoOrAdmin || ledSubsystemIds.size > 0
  const subsystemOptions = userIsCtoOrAdmin ? subsystems : subsystems.filter((s) => ledSubsystemIds.has(s.id))

  let events, milestones, taskDeadlines, recurringEvents
  try {
    ;[events, milestones, taskDeadlines, recurringEvents] = await Promise.all([
      listCalendarEventsInRange(supabase, rangeStart.toISOString(), rangeEnd.toISOString()),
      listMilestonesInRange(supabase, rangeStartDate, rangeEndDate),
      listTaskDeadlinesInRange(supabase, deadlineRangeStart, deadlineRangeEnd),
      listRecurringEvents(supabase),
    ])
  } catch {
    return <ErrorState message="Could not load the calendar." />
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Calendar</h1>
        <p className="mt-0.5 text-xs font-mono text-text-muted">Team events, recurring meetings, milestones, and task deadlines.</p>
      </div>
      <CalendarToolbar canManage={canManage} subsystemOptions={subsystemOptions} isCtoOrAdmin={userIsCtoOrAdmin} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MonthCalendar
            year={year}
            month={month}
            events={events}
            milestones={milestones}
            taskDeadlines={taskDeadlines}
            canEditSubsystemIds={ledSubsystemIds}
            isCtoOrAdmin={userIsCtoOrAdmin}
          />
        </div>
        <div>
          <RecurringEventsPanel
            recurringEvents={recurringEvents}
            canManage={canManage}
            subsystemOptions={subsystemOptions}
            isCtoOrAdmin={userIsCtoOrAdmin}
            canEditSubsystemIds={ledSubsystemIds}
          />
        </div>
      </div>
    </div>
  )
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { todayDateKey } from '@/lib/deadline'
import type {
  MeetingAgendaSourceType,
  SuggestedMeetingTopic,
  TechnicalMeeting,
  TechnicalMeetingActionItem,
  TechnicalMeetingAgendaItem,
  TechnicalMeetingSuggestionDismissal,
} from '@/types/database'

const MEETING_SELECT = `*, creator:profiles!technical_meetings_created_by_fkey(id, display_name, email)`
const ACTION_ITEM_SELECT = `
  *,
  assignee:profiles!technical_meeting_action_items_assigned_to_fkey(id, display_name, email, avatar_url),
  subsystem:subsystems(id, name),
  linked_task:tasks(id, title, status)
`

export interface MeetingFilters {
  status?: string
}

export async function listMeetings(supabase: SupabaseClient, filters: MeetingFilters = {}): Promise<TechnicalMeeting[]> {
  let query = supabase.from('technical_meetings').select(MEETING_SELECT).order('meeting_date', { ascending: false })
  if (filters.status) query = query.eq('status', filters.status)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as TechnicalMeeting[]
}

export async function getMeetingById(supabase: SupabaseClient, id: string): Promise<TechnicalMeeting | null> {
  const { data, error } = await supabase.from('technical_meetings').select(MEETING_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  return data as unknown as TechnicalMeeting | null
}

export async function createMeeting(
  supabase: SupabaseClient,
  input: { title: string; meeting_date: string; start_time?: string | null }
): Promise<TechnicalMeeting> {
  const { data, error } = await supabase.from('technical_meetings').insert(input).select(MEETING_SELECT).single()
  if (error) throw error
  return data as unknown as TechnicalMeeting
}

export async function updateMeeting(supabase: SupabaseClient, id: string, patch: Record<string, unknown>): Promise<TechnicalMeeting> {
  const { data, error } = await supabase.from('technical_meetings').update(patch).eq('id', id).select(MEETING_SELECT).single()
  if (error) throw error
  return data as unknown as TechnicalMeeting
}

// RLS decides who may delete (a manager, and only an empty still-planned meeting — migration 0041); a
// blocked delete is a silent zero-row result, so ask for the row back and treat "nothing deleted" as an error,
// same pattern as deleteTask/deleteSponsor.
export async function deleteMeeting(supabase: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await supabase.from('technical_meetings').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('This meeting could not be deleted. Only an empty, still-planned meeting can be removed — one with any notes, decisions or action items is kept as history.')
  }
}

export async function listAgendaItems(supabase: SupabaseClient, meetingId: string): Promise<TechnicalMeetingAgendaItem[]> {
  const { data, error } = await supabase
    .from('technical_meeting_agenda_items')
    .select('*')
    .eq('meeting_id', meetingId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as TechnicalMeetingAgendaItem[]
}

export async function addAgendaItem(
  supabase: SupabaseClient,
  // sort_order is trigger-derived (migration 0042) — always "next slot in this meeting" —
  // and deliberately not accepted here, so every insertion path stays consistent.
  input: { meeting_id: string; title: string; source_type?: MeetingAgendaSourceType; source_id?: string | null }
): Promise<TechnicalMeetingAgendaItem> {
  const { data, error } = await supabase.from('technical_meeting_agenda_items').insert(input).select().single()
  if (error) throw error
  return data as TechnicalMeetingAgendaItem
}

export async function updateAgendaItem(supabase: SupabaseClient, id: string, patch: Record<string, unknown>): Promise<TechnicalMeetingAgendaItem> {
  const { data, error } = await supabase.from('technical_meeting_agenda_items').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as TechnicalMeetingAgendaItem
}

export async function deleteAgendaItem(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('technical_meeting_agenda_items').delete().eq('id', id)
  if (error) throw error
}

// "Reorder" is two neighbours swapping sort_order — simpler and more reliable on a 375px screen than drag and
// drop, and needs no extra library. Both updates are awaited together; if one is rejected by RLS (a plain
// recorder trying this on a completed meeting) the other still applies, which just leaves the list in its
// original order — never a corrupt one, since sort_order is only ever a display order, not a unique key.
export async function swapAgendaItemOrder(
  supabase: SupabaseClient,
  a: { id: string; sort_order: number },
  b: { id: string; sort_order: number }
): Promise<void> {
  const [ra, rb] = await Promise.all([
    supabase.from('technical_meeting_agenda_items').update({ sort_order: b.sort_order }).eq('id', a.id),
    supabase.from('technical_meeting_agenda_items').update({ sort_order: a.sort_order }).eq('id', b.id),
  ])
  if (ra.error) throw ra.error
  if (rb.error) throw rb.error
}

export async function listActionItems(supabase: SupabaseClient, meetingId: string): Promise<TechnicalMeetingActionItem[]> {
  const { data, error } = await supabase
    .from('technical_meeting_action_items')
    .select(ACTION_ITEM_SELECT)
    .eq('meeting_id', meetingId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as TechnicalMeetingActionItem[]
}

export async function createActionItem(
  supabase: SupabaseClient,
  input: {
    meeting_id: string
    agenda_item_id?: string | null
    title: string
    description?: string | null
    assigned_to?: string | null
    due_date?: string | null
    subsystem_id?: string | null
  }
): Promise<TechnicalMeetingActionItem> {
  const { data, error } = await supabase.from('technical_meeting_action_items').insert(input).select(ACTION_ITEM_SELECT).single()
  if (error) throw error
  return data as unknown as TechnicalMeetingActionItem
}

export async function updateActionItem(supabase: SupabaseClient, id: string, patch: Record<string, unknown>): Promise<TechnicalMeetingActionItem> {
  const { data, error } = await supabase.from('technical_meeting_action_items').update(patch).eq('id', id).select(ACTION_ITEM_SELECT).single()
  if (error) throw error
  return data as unknown as TechnicalMeetingActionItem
}

export async function deleteActionItem(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('technical_meeting_action_items').delete().eq('id', id)
  if (error) throw error
}

// The one sanctioned way an action item becomes a real task (migration 0041's create_task_from_meeting_action):
// row-locks the action item, refuses if it is already linked, and reuses the normal task-creation path rather
// than maintaining a second copy of the data. Returns the new task's id.
export async function createTaskFromMeetingAction(supabase: SupabaseClient, actionItemId: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_task_from_meeting_action', { p_action_item_id: actionItemId })
  if (error) throw error
  return data as string
}

export async function listSuggestionDismissals(supabase: SupabaseClient, meetingId: string): Promise<TechnicalMeetingSuggestionDismissal[]> {
  const { data, error } = await supabase.from('technical_meeting_suggestion_dismissals').select('*').eq('meeting_id', meetingId)
  if (error) throw error
  return (data ?? []) as TechnicalMeetingSuggestionDismissal[]
}

export async function dismissSuggestion(
  supabase: SupabaseClient,
  meetingId: string,
  sourceType: Exclude<MeetingAgendaSourceType, 'manual'>,
  sourceId: string
): Promise<void> {
  const { error } = await supabase.from('technical_meeting_suggestion_dismissals').insert({ meeting_id: meetingId, source_type: sourceType, source_id: sourceId })
  if (error) throw error
}

// ---------------------------------------------------------------------------------------------
// Previous-meeting follow-up: the most recently COMPLETED meeting (other than the one being
// prepared) and its unresolved action items. "Unresolved" follows the linked task's own status
// where one exists — creating a task from an action item never flips the action item's own
// `status` column, so an item that spawned a task only really counts as resolved once that task is
// Complete (or the action item itself was separately marked complete/cancelled).
// ---------------------------------------------------------------------------------------------
export interface PreviousMeetingFollowUp {
  meeting: TechnicalMeeting
  unresolvedActionItems: TechnicalMeetingActionItem[]
}

export async function getPreviousMeetingFollowUp(supabase: SupabaseClient, excludeMeetingId?: string): Promise<PreviousMeetingFollowUp | null> {
  let query = supabase.from('technical_meetings').select(MEETING_SELECT).eq('status', 'completed').order('meeting_date', { ascending: false }).limit(1)
  if (excludeMeetingId) query = query.neq('id', excludeMeetingId)
  const { data: meetings, error: meetingError } = await query
  if (meetingError) throw meetingError
  const meeting = (meetings ?? [])[0] as unknown as TechnicalMeeting | undefined
  if (!meeting) return null

  const { data, error } = await supabase
    .from('technical_meeting_action_items')
    .select(ACTION_ITEM_SELECT)
    .eq('meeting_id', meeting.id)
    .not('status', 'in', '(complete,cancelled)')
  if (error) throw error

  const unresolvedActionItems = ((data ?? []) as unknown as TechnicalMeetingActionItem[]).filter(
    (a) => !a.linked_task_id || a.linked_task?.status !== 'Complete'
  )
  return { meeting, unresolvedActionItems }
}

// ---------------------------------------------------------------------------------------------
// Suggested Topics: real candidates pulled from tasks, milestones, task requests, purchasing and
// CAD, with anything already on this meeting's agenda or already dismissed for it filtered out.
// Every count here mirrors an existing "needs attention" definition already used elsewhere in the
// app (lib/supabase/queries/admin.ts) rather than inventing a new one. The W1-15 timeline grid has
// no date field, so it cannot be included here — it can only ever be added as a manual topic.
// ---------------------------------------------------------------------------------------------
function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

async function dueSoonHorizon(supabase: SupabaseClient, meeting: TechnicalMeeting): Promise<string> {
  const today = todayDateKey()
  const weekOut = addDays(today, 7)
  const { data } = await supabase
    .from('technical_meetings')
    .select('meeting_date')
    .eq('status', 'planned')
    .gt('meeting_date', meeting.meeting_date)
    .order('meeting_date', { ascending: true })
    .limit(1)
  const nextMeetingDate = (data ?? [])[0]?.meeting_date as string | undefined
  if (nextMeetingDate && nextMeetingDate > weekOut) return nextMeetingDate
  return weekOut
}

const CANDIDATE_LIMIT = 15

export async function listSuggestedTopics(supabase: SupabaseClient, meeting: TechnicalMeeting): Promise<SuggestedMeetingTopic[]> {
  const today = todayDateKey()
  const horizon = await dueSoonHorizon(supabase, meeting)

  const [existingAgendaItems, dismissals, overdueTasks, dueSoonTasks, noDeadlineTasks, blockedTasks, milestones, taskRequests, purchasing, cad] =
    await Promise.all([
      listAgendaItems(supabase, meeting.id),
      listSuggestionDismissals(supabase, meeting.id),
      supabase.from('tasks').select('id, title, subsystem_id, deadline').lt('deadline', today).neq('status', 'Complete').limit(CANDIDATE_LIMIT),
      supabase.from('tasks').select('id, title, subsystem_id, deadline').gte('deadline', today).lte('deadline', horizon).neq('status', 'Complete').limit(CANDIDATE_LIMIT),
      supabase.from('tasks').select('id, title, subsystem_id').is('deadline', null).neq('status', 'Complete').limit(CANDIDATE_LIMIT),
      supabase.from('tasks').select('id, title, subsystem_id').eq('status', 'Blocked').limit(CANDIDATE_LIMIT),
      supabase.from('milestones').select('id, name, date, subsystem_id').eq('active', true).gte('date', today).lte('date', horizon).limit(CANDIDATE_LIMIT),
      supabase.from('task_requests').select('id, title, subsystem_id').eq('status', 'pending').limit(CANDIDATE_LIMIT),
      supabase.from('purchase_requests').select('id, title, vendor').in('status', ['Submitted', 'Under Review']).limit(CANDIDATE_LIMIT),
      supabase.from('cad_reviews').select('id, title, subsystem_id').eq('status', 'Submitted for Review').limit(CANDIDATE_LIMIT),
    ])

  const already = new Set(existingAgendaItems.filter((a) => a.source_id).map((a) => `${a.source_type}:${a.source_id}`))
  const dismissed = new Set(dismissals.map((d) => `${d.source_type}:${d.source_id}`))
  const isFiltered = (sourceType: string, sourceId: string) => already.has(`${sourceType}:${sourceId}`) || dismissed.has(`${sourceType}:${sourceId}`)

  const topics: SuggestedMeetingTopic[] = []
  const pushRows = (
    rows: { data: unknown[] | null } | undefined,
    sourceType: Exclude<MeetingAgendaSourceType, 'manual'>,
    category: SuggestedMeetingTopic['category'],
    map: (row: any) => { title: string; detail: string | null }
  ) => {
    for (const row of (rows?.data ?? []) as any[]) {
      if (isFiltered(sourceType, row.id)) continue
      const { title, detail } = map(row)
      topics.push({ sourceType, sourceId: row.id, title, detail, category })
    }
  }

  pushRows(overdueTasks, 'task', 'overdue', (r) => ({ title: r.title, detail: `Overdue since ${r.deadline?.slice(0, 10)}` }))
  pushRows(dueSoonTasks, 'task', 'due_soon', (r) => ({ title: r.title, detail: `Due ${r.deadline?.slice(0, 10)}` }))
  pushRows(noDeadlineTasks, 'task', 'no_deadline', (r) => ({ title: r.title, detail: 'No deadline set — may need scheduling' }))
  pushRows(blockedTasks, 'task', 'blocked', (r) => ({ title: r.title, detail: 'Blocked' }))
  pushRows(milestones, 'milestone', 'milestone', (r) => ({ title: r.name, detail: `Milestone on ${r.date}` }))
  pushRows(taskRequests, 'task_request', 'task_request', (r) => ({ title: r.title, detail: 'Open task request awaiting review' }))
  pushRows(purchasing, 'purchasing', 'purchasing', (r) => ({ title: r.title, detail: r.vendor ? `Awaiting a decision · ${r.vendor}` : 'Awaiting a decision' }))
  pushRows(cad, 'cad', 'cad', (r) => ({ title: r.title, detail: 'Submitted for review' }))

  return topics
}

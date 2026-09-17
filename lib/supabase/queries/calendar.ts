import type { SupabaseClient } from '@supabase/supabase-js'
import type { CalendarEvent, RecurringEvent, Milestone, Task } from '@/types/database'

const CALENDAR_EVENT_SELECT = `
  *,
  subsystem:subsystems(id, name),
  creator:profiles(id, display_name, email)
`

export async function listCalendarEventsInRange(supabase: SupabaseClient, startIso: string, endIso: string): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select(CALENDAR_EVENT_SELECT)
    .eq('active', true)
    .lte('start_time', endIso)
    .gte('end_time', startIso)
    .order('start_time', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as CalendarEvent[]
}

export async function createCalendarEvent(
  supabase: SupabaseClient,
  input: { title: string; description?: string | null; start_time: string; end_time: string; subsystem_id?: string | null }
) {
  const { data, error } = await supabase.from('calendar_events').insert(input).select(CALENDAR_EVENT_SELECT).single()
  if (error) throw error
  return data as unknown as CalendarEvent
}

export async function updateCalendarEvent(supabase: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { data, error } = await supabase.from('calendar_events').update(patch).eq('id', id).select(CALENDAR_EVENT_SELECT).single()
  if (error) throw error
  return data as unknown as CalendarEvent
}

export async function listRecurringEvents(supabase: SupabaseClient): Promise<RecurringEvent[]> {
  const { data, error } = await supabase
    .from('recurring_events')
    .select('*, subsystem:subsystems(id, name)')
    .eq('active', true)
    .order('day_of_week', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as RecurringEvent[]
}

export async function createRecurringEvent(
  supabase: SupabaseClient,
  input: { title: string; day_of_week: number; time_label?: string | null; color?: string | null; subsystem_id?: string | null }
) {
  const { data, error } = await supabase.from('recurring_events').insert(input).select('*, subsystem:subsystems(id, name)').single()
  if (error) throw error
  return data as unknown as RecurringEvent
}

export async function updateRecurringEvent(supabase: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { data, error } = await supabase.from('recurring_events').update(patch).eq('id', id).select('*, subsystem:subsystems(id, name)').single()
  if (error) throw error
  return data as unknown as RecurringEvent
}

export async function listMilestonesInRange(supabase: SupabaseClient, startDate: string, endDate: string): Promise<Milestone[]> {
  const { data, error } = await supabase
    .from('milestones')
    .select('*, subsystem:subsystems(id, name)')
    .eq('active', true)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as Milestone[]
}

export async function createMilestone(
  supabase: SupabaseClient,
  input: { name: string; date: string; description?: string | null; subsystem_id?: string | null }
) {
  const { data, error } = await supabase.from('milestones').insert(input).select('*, subsystem:subsystems(id, name)').single()
  if (error) throw error
  return data as unknown as Milestone
}

export async function updateMilestone(supabase: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { data, error } = await supabase.from('milestones').update(patch).eq('id', id).select('*, subsystem:subsystems(id, name)').single()
  if (error) throw error
  return data as unknown as Milestone
}

export async function listTaskDeadlinesInRange(supabase: SupabaseClient, startIso: string, endIso: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, status, priority, deadline, subsystem:subsystems(id, name)')
    .gte('deadline', startIso)
    .lte('deadline', endIso)
    .order('deadline', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as Task[]
}

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Task } from '@/types/database'

// The slice of a task the scheduling views need — read-only plus a deadline.
export type SchedulingTask = Pick<Task, 'id' | 'title' | 'status' | 'priority' | 'deadline' | 'subsystem_id'> & {
  subsystem?: { id: string; name: string } | null
  primary_owner?: { id: string; display_name: string | null; email: string | null } | null
}

// Every open task across all subsystems (the COO can read them all, migration 0028), for the
// overdue / upcoming / unscheduled views and the per-subsystem scheduling overview.
export async function listOpenSchedulingTasks(supabase: SupabaseClient): Promise<SchedulingTask[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, status, priority, deadline, subsystem_id, subsystem:subsystems(id, name), primary_owner:profiles!tasks_primary_owner_id_fkey(id, display_name, email)')
    .neq('status', 'Complete')
    .order('deadline', { ascending: true, nullsFirst: false })
  if (error) throw error
  return (data ?? []) as unknown as SchedulingTask[]
}

// Deadline-only edit (migration 0028): reschedule_task() checks the caller is coo/cto/admin and
// changes nothing but the deadline. Deadlines are date-only (see lib/deadline.ts), stored as
// midnight UTC of the calendar date, so a 'YYYY-MM-DD' key is sent as exactly that.
export async function rescheduleTask(supabase: SupabaseClient, taskId: string, dateKey: string | null): Promise<void> {
  const { error } = await supabase.rpc('reschedule_task', {
    p_task_id: taskId,
    p_deadline: dateKey ? `${dateKey}T00:00:00.000Z` : null,
  })
  if (error) throw error
}

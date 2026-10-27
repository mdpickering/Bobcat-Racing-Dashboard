import type { SupabaseClient } from '@supabase/supabase-js'
import type { PickupTask, TaskSize } from '@/lib/pickup'

// The pick-up board (migration 0046). Task visibility is per subsystem, so the board is read, claimed, released and
// edited through database functions that check the rules themselves (see the migration).

export async function listPickupTasks(supabase: SupabaseClient): Promise<PickupTask[]> {
  const { data, error } = await supabase.rpc('list_pickup_tasks')
  if (error) throw error
  return (data ?? []) as PickupTask[]
}

/** The open pick-up tasks you hold right now (your own tasks, so ordinary task visibility already allows this). */
export async function listMyPickupTasks(supabase: SupabaseClient, userId: string): Promise<{ id: string; title: string; status: string; size: TaskSize; subsystem_id: string }[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, status, size, subsystem_id')
    .eq('primary_owner_id', userId)
    .not('size', 'is', null)
    .neq('status', 'Complete')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as { id: string; title: string; status: string; size: TaskSize; subsystem_id: string }[]
}

export async function claimPickupTask(supabase: SupabaseClient, taskId: string): Promise<void> {
  const { error } = await supabase.rpc('claim_pickup_task', { p_task_id: taskId })
  if (error) throw error
}

export async function releasePickupTask(supabase: SupabaseClient, taskId: string): Promise<void> {
  const { error } = await supabase.rpc('release_pickup_task', { p_task_id: taskId })
  if (error) throw error
}

/** Put a task on the board with a size, or pass null to take it off (subsystem lead, COO, cto/admin). */
export async function setTaskSize(supabase: SupabaseClient, taskId: string, size: TaskSize | null): Promise<void> {
  const { error } = await supabase.rpc('set_task_size', { p_task_id: taskId, p_size: size })
  if (error) throw error
}

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TimelineColumn, TimelineMilestone } from '@/types/database'

export async function listTimelineColumns(supabase: SupabaseClient, includeInactive = false): Promise<TimelineColumn[]> {
  let query = supabase.from('timeline_columns').select('*').order('sort_order', { ascending: true })
  if (!includeInactive) query = query.eq('active', true)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as TimelineColumn[]
}

export async function createTimelineColumn(
  supabase: SupabaseClient,
  input: { key: string; label: string; sort_order: number; highlight?: boolean }
) {
  const { data, error } = await supabase.from('timeline_columns').insert(input).select().single()
  if (error) throw error
  return data as unknown as TimelineColumn
}

export async function updateTimelineColumn(supabase: SupabaseClient, key: string, patch: Record<string, unknown>) {
  const { data, error } = await supabase.from('timeline_columns').update(patch).eq('key', key).select().single()
  if (error) throw error
  return data as unknown as TimelineColumn
}

export async function listTimelineMilestones(supabase: SupabaseClient): Promise<TimelineMilestone[]> {
  const { data, error } = await supabase.from('timeline_milestones').select('*')
  if (error) throw error
  return (data ?? []) as TimelineMilestone[]
}

export async function setTimelineMilestoneText(supabase: SupabaseClient, subsystemId: string, timelineColumnKey: string, text: string) {
  const trimmed = text.trim()
  if (!trimmed) {
    const { error } = await supabase
      .from('timeline_milestones')
      .delete()
      .eq('subsystem_id', subsystemId)
      .eq('timeline_column_key', timelineColumnKey)
    if (error) throw error
    return null
  }

  // Composite-key upsert: try insert first, fall back to update on conflict —
  // same pattern as task_assignees (setTaskAssignee) since the PK columns
  // themselves are never part of the update grant.
  const { error: insertError } = await supabase
    .from('timeline_milestones')
    .insert({ subsystem_id: subsystemId, timeline_column_key: timelineColumnKey, milestone_text: trimmed })
  if (!insertError) return trimmed
  if (insertError.code !== '23505') throw insertError
  const { error: updateError } = await supabase
    .from('timeline_milestones')
    .update({ milestone_text: trimmed })
    .eq('subsystem_id', subsystemId)
    .eq('timeline_column_key', timelineColumnKey)
  if (updateError) throw updateError
  return trimmed
}

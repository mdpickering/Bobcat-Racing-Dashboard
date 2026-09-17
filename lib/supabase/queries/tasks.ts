import type { SupabaseClient } from '@supabase/supabase-js'
import type { Task, TaskComment, TaskAssignee, TaskAttachment, TaskRequest } from '@/types/database'

const TASK_SELECT = `
  *,
  subsystem:subsystems(id, name),
  category:subsystem_categories(id, name),
  primary_owner:profiles!tasks_primary_owner_id_fkey(id, display_name, email, avatar_url),
  assignees:task_assignees(task_id, user_id, role, created_at, profile:profiles(id, display_name, email, avatar_url))
`

export interface TaskFilters {
  subsystemId?: string
  categoryId?: string
  priority?: string
  status?: string
  search?: string
  assignedToMe?: string
}

export async function listTasks(supabase: SupabaseClient, filters: TaskFilters = {}): Promise<Task[]> {
  let query = supabase.from('tasks').select(TASK_SELECT).order('deadline', { ascending: true, nullsFirst: false })

  if (filters.subsystemId) query = query.eq('subsystem_id', filters.subsystemId)
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
  if (filters.priority) query = query.eq('priority', filters.priority)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.search) query = query.ilike('title', `%${filters.search}%`)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as Task[]
}

export async function getTaskById(supabase: SupabaseClient, id: string): Promise<Task | null> {
  const { data, error } = await supabase.from('tasks').select(TASK_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  return data as unknown as Task | null
}

export async function createTask(
  supabase: SupabaseClient,
  input: { title: string; description?: string | null; subsystem_id: string; category_id?: string | null; priority?: string; status?: string; deadline?: string | null }
) {
  const { data, error } = await supabase.from('tasks').insert(input).select(TASK_SELECT).single()
  if (error) throw error
  return data as unknown as Task
}

export async function updateTask(supabase: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select(TASK_SELECT).single()
  if (error) throw error
  return data as unknown as Task
}

export async function setTaskAssignee(
  supabase: SupabaseClient,
  taskId: string,
  userId: string,
  role: 'primary' | 'co_owner'
) {
  // .upsert() generates INSERT ... ON CONFLICT DO UPDATE, which needs
  // UPDATE privilege on task_id/user_id too (the conflict target) even
  // though their values never change — but by design only `role` is
  // grantable for update (task_id/user_id are the immutable composite
  // key). So: try the insert; if the row already exists, fall back to a
  // plain update of just `role`.
  const { error: insertError } = await supabase.from('task_assignees').insert({ task_id: taskId, user_id: userId, role })
  if (!insertError) return
  if (insertError.code !== '23505') throw insertError // not a duplicate-key conflict — a real error
  const { error: updateError } = await supabase.from('task_assignees').update({ role }).eq('task_id', taskId).eq('user_id', userId)
  if (updateError) throw updateError
}

export async function removeTaskAssignee(supabase: SupabaseClient, taskId: string, userId: string) {
  const { error } = await supabase.from('task_assignees').delete().eq('task_id', taskId).eq('user_id', userId)
  if (error) throw error
}

// task_comments has two relationship paths to profiles — directly via
// user_id, and indirectly via comment_mentions — so the embed must be
// hinted with the FK constraint name or PostgREST can't disambiguate
// (PGRST201).
const COMMENT_USER_EMBED = 'user:profiles!task_comments_user_id_fkey(id, display_name, email, avatar_url)'

export async function listTaskComments(supabase: SupabaseClient, taskId: string): Promise<TaskComment[]> {
  const { data, error } = await supabase
    .from('task_comments')
    .select(`*, ${COMMENT_USER_EMBED}, mentions:comment_mentions(comment_id, mentioned_profile_id, profile:profiles(id, display_name, email))`)
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as TaskComment[]
}

export async function addTaskComment(supabase: SupabaseClient, taskId: string, comment: string, mentionUserIds: string[] = []) {
  const { data, error } = await supabase.from('task_comments').insert({ task_id: taskId, comment }).select(`*, ${COMMENT_USER_EMBED}`).single()
  if (error) throw error
  if (mentionUserIds.length > 0) {
    const rows = mentionUserIds.map((mentioned_profile_id) => ({ comment_id: (data as { id: string }).id, mentioned_profile_id }))
    const { error: mentionError } = await supabase.from('comment_mentions').insert(rows)
    if (mentionError) throw mentionError
  }
  return data as unknown as TaskComment
}

export async function updateTaskComment(supabase: SupabaseClient, commentId: string, comment: string) {
  const { data, error } = await supabase.from('task_comments').update({ comment }).eq('id', commentId).select().single()
  if (error) throw error
  return data as unknown as TaskComment
}

export async function listTaskAttachments(supabase: SupabaseClient, taskId: string): Promise<TaskAttachment[]> {
  const { data, error } = await supabase
    .from('task_attachments')
    .select('*, uploader:profiles(id, display_name, email)')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as TaskAttachment[]
}

export async function addTaskAttachmentMetadata(
  supabase: SupabaseClient,
  input: { task_id: string; file_name: string; storage_path: string; file_size: number; mime_type?: string | null }
) {
  const { data, error } = await supabase.from('task_attachments').insert(input).select().single()
  if (error) throw error
  return data as unknown as TaskAttachment
}

export async function listTaskRequests(supabase: SupabaseClient, subsystemId?: string): Promise<TaskRequest[]> {
  // task_requests has two FK paths to profiles (requester_id, reviewed_by),
  // so the embed needs the FK hint to disambiguate — same PGRST201 class
  // of issue as task_comments.
  let query = supabase
    .from('task_requests')
    .select('*, requester:profiles!task_requests_requester_id_fkey(id, display_name, email), subsystem:subsystems(id, name)')
    .order('created_at', { ascending: false })
  if (subsystemId) query = query.eq('subsystem_id', subsystemId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as TaskRequest[]
}

export async function createTaskRequest(
  supabase: SupabaseClient,
  input: { subsystem_id: string; title: string; description?: string | null }
) {
  const { data, error } = await supabase.from('task_requests').insert(input).select().single()
  if (error) throw error
  return data as unknown as TaskRequest
}

export async function reviewTaskRequest(
  supabase: SupabaseClient,
  requestId: string,
  patch: { status: 'approved' | 'declined'; reviewed_by: string; reviewed_at: string; converted_task_id?: string | null }
) {
  const { data, error } = await supabase.from('task_requests').update(patch).eq('id', requestId).select().single()
  if (error) throw error
  return data as unknown as TaskRequest
}

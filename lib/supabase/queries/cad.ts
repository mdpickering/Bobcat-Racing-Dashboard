import type { SupabaseClient } from '@supabase/supabase-js'
import type { CadReview, CadReviewVersion, CadReviewComment } from '@/types/database'

const CAD_REVIEW_SELECT = `
  *,
  subsystem:subsystems(id, name),
  task:tasks(id, title),
  submitter:profiles!cad_reviews_submitted_by_fkey(id, display_name, email, avatar_url),
  reviewer:profiles!cad_reviews_reviewer_id_fkey(id, display_name, email, avatar_url)
`

export interface CadReviewFilters {
  subsystemId?: string
  status?: string
}

export async function listCadReviews(supabase: SupabaseClient, filters: CadReviewFilters = {}): Promise<CadReview[]> {
  let query = supabase.from('cad_reviews').select(CAD_REVIEW_SELECT).order('created_at', { ascending: false })
  if (filters.subsystemId) query = query.eq('subsystem_id', filters.subsystemId)
  if (filters.status) query = query.eq('status', filters.status)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as CadReview[]
}

export async function getCadReviewById(supabase: SupabaseClient, id: string): Promise<CadReview | null> {
  const { data, error } = await supabase.from('cad_reviews').select(CAD_REVIEW_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  return data as unknown as CadReview | null
}

export async function createCadReview(
  supabase: SupabaseClient,
  input: { subsystem_id: string; task_id?: string | null; title: string; description?: string | null }
) {
  const { data, error } = await supabase.from('cad_reviews').insert(input).select(CAD_REVIEW_SELECT).single()
  if (error) throw error
  return data as unknown as CadReview
}

export async function updateCadReview(supabase: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { data, error } = await supabase.from('cad_reviews').update(patch).eq('id', id).select(CAD_REVIEW_SELECT).single()
  if (error) throw error
  return data as unknown as CadReview
}

// RLS decides who may delete (cto/admin, or the creator while still a Draft nobody else has
// commented on); versions and comments go with the review via ON DELETE CASCADE. A blocked
// delete is a silent zero-row result, so ask for the deleted row back.
export async function deleteCadReview(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from('cad_reviews').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('This CAD review could not be deleted. You may not have permission, or it no longer exists.')
  }
}

export async function listCadReviewVersions(supabase: SupabaseClient, cadReviewId: string): Promise<CadReviewVersion[]> {
  const { data, error } = await supabase
    .from('cad_review_versions')
    .select('*, submitter:profiles(id, display_name, email)')
    .eq('cad_review_id', cadReviewId)
    .order('revision_number', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as CadReviewVersion[]
}

export async function addCadReviewVersion(
  supabase: SupabaseClient,
  input: { cad_review_id: string; external_cad_link?: string | null; drawing_link?: string | null; notes?: string | null }
) {
  const { data, error } = await supabase.from('cad_review_versions').insert(input).select('*, submitter:profiles(id, display_name, email)').single()
  if (error) throw error
  return data as unknown as CadReviewVersion
}

export async function listCadReviewComments(supabase: SupabaseClient, cadReviewId: string): Promise<CadReviewComment[]> {
  const { data, error } = await supabase
    .from('cad_review_comments')
    .select('*, user:profiles(id, display_name, email, avatar_url)')
    .eq('cad_review_id', cadReviewId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as CadReviewComment[]
}

export async function addCadReviewComment(supabase: SupabaseClient, cadReviewId: string, comment: string) {
  const { data, error } = await supabase
    .from('cad_review_comments')
    .insert({ cad_review_id: cadReviewId, comment })
    .select('*, user:profiles(id, display_name, email, avatar_url)')
    .single()
  if (error) throw error
  return data as unknown as CadReviewComment
}

export async function updateCadReviewComment(supabase: SupabaseClient, commentId: string, comment: string) {
  const { data, error } = await supabase.from('cad_review_comments').update({ comment }).eq('id', commentId).select().single()
  if (error) throw error
  return data as unknown as CadReviewComment
}

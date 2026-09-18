import type { SupabaseClient } from '@supabase/supabase-js'
import type { Profile, UserRole } from '@/types/user'
import type { MemberApplication } from '@/types/database'

export interface UserFilters {
  search?: string
  role?: string
  approved?: 'true' | 'false'
  active?: 'true' | 'false'
}

export async function listAllProfiles(supabase: SupabaseClient, filters: UserFilters = {}): Promise<Profile[]> {
  let query = supabase.from('profiles').select('*').order('created_at', { ascending: false })
  if (filters.search) query = query.or(`display_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`)
  if (filters.role) query = query.eq('role', filters.role)
  if (filters.approved) query = query.eq('approved', filters.approved === 'true')
  if (filters.active) query = query.eq('active', filters.active === 'true')
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Profile[]
}

export async function getProfileById(supabase: SupabaseClient, id: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as Profile | null
}

// role/approved/active have no direct column grant (see
// 0020_admin_user_management.sql) — these RPCs run as SECURITY
// DEFINER functions that check is_cto_or_admin() and block
// self-modification internally, bypassing RLS/grants entirely,
// the same mechanism every other privileged writer in this
// schema uses.
export async function adminSetUserRole(supabase: SupabaseClient, userId: string, role: UserRole) {
  const { error } = await supabase.rpc('admin_set_user_role', { p_user_id: userId, p_role: role })
  if (error) throw error
}

export async function adminSetUserApproved(supabase: SupabaseClient, userId: string, approved: boolean) {
  const { error } = await supabase.rpc('admin_set_user_approved', { p_user_id: userId, p_approved: approved })
  if (error) throw error
}

export async function adminSetUserActive(supabase: SupabaseClient, userId: string, active: boolean) {
  const { error } = await supabase.rpc('admin_set_user_active', { p_user_id: userId, p_active: active })
  if (error) throw error
}

export interface ApplicationFilters {
  status?: string
}

export async function listMemberApplications(supabase: SupabaseClient, filters: ApplicationFilters = {}): Promise<MemberApplication[]> {
  let query = supabase
    .from('member_applications')
    .select('*, reviewer:profiles!member_applications_reviewed_by_fkey(id, display_name, email)')
    .order('submitted_at', { ascending: false })
  if (filters.status) query = query.eq('status', filters.status)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as MemberApplication[]
}

export async function getMemberApplicationById(supabase: SupabaseClient, id: string): Promise<MemberApplication | null> {
  const { data, error } = await supabase
    .from('member_applications')
    .select('*, reviewer:profiles!member_applications_reviewed_by_fkey(id, display_name, email)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data as unknown as MemberApplication | null
}

export async function reviewMemberApplication(
  supabase: SupabaseClient,
  id: string,
  status: 'approved' | 'rejected',
  reviewerId: string
) {
  const { data, error } = await supabase
    .from('member_applications')
    .update({ status, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as unknown as MemberApplication
}

export interface AdminOverviewCounts {
  activeMemberCount: number
  pendingApplicationCount: number
  pendingTaskRequestCount: number
  purchaseNeedsAttentionCount: number
  cadNeedsAttentionCount: number
}

export async function getAdminOverviewCounts(supabase: SupabaseClient): Promise<AdminOverviewCounts> {
  const [activeMembers, pendingApplications, pendingTaskRequests, purchaseAttention, cadAttention] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('approved', true).eq('active', true),
    supabase.from('member_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('task_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('purchase_requests').select('id', { count: 'exact', head: true }).in('status', ['Submitted', 'Under Review']),
    supabase.from('cad_reviews').select('id', { count: 'exact', head: true }).eq('status', 'Submitted for Review'),
  ])
  return {
    activeMemberCount: activeMembers.count ?? 0,
    pendingApplicationCount: pendingApplications.count ?? 0,
    pendingTaskRequestCount: pendingTaskRequests.count ?? 0,
    purchaseNeedsAttentionCount: purchaseAttention.count ?? 0,
    cadNeedsAttentionCount: cadAttention.count ?? 0,
  }
}

export interface RecentActivityItem {
  type: 'task_request' | 'purchase_request' | 'cad_review' | 'member_application'
  id: string
  title: string
  status: string
  createdAt: string
  href: string
}

export async function listRecentActivity(supabase: SupabaseClient, limit = 8): Promise<RecentActivityItem[]> {
  const [taskRequests, purchaseRequests, cadReviews, applications] = await Promise.all([
    supabase.from('task_requests').select('id, title, status, created_at').order('created_at', { ascending: false }).limit(limit),
    supabase.from('purchase_requests').select('id, title, status, created_at').order('created_at', { ascending: false }).limit(limit),
    supabase.from('cad_reviews').select('id, title, status, created_at').order('created_at', { ascending: false }).limit(limit),
    supabase.from('member_applications').select('id, name, status, submitted_at').order('submitted_at', { ascending: false }).limit(limit),
  ])

  const items: RecentActivityItem[] = [
    ...((taskRequests.data ?? []) as { id: string; title: string; status: string; created_at: string }[]).map((r) => ({
      type: 'task_request' as const,
      id: r.id,
      title: r.title,
      status: r.status,
      createdAt: r.created_at,
      href: '/tasks?tab=requests',
    })),
    ...((purchaseRequests.data ?? []) as { id: string; title: string; status: string; created_at: string }[]).map((r) => ({
      type: 'purchase_request' as const,
      id: r.id,
      title: r.title,
      status: r.status,
      createdAt: r.created_at,
      href: `/purchasing/${r.id}`,
    })),
    ...((cadReviews.data ?? []) as { id: string; title: string; status: string; created_at: string }[]).map((r) => ({
      type: 'cad_review' as const,
      id: r.id,
      title: r.title,
      status: r.status,
      createdAt: r.created_at,
      href: `/cad/${r.id}`,
    })),
    ...((applications.data ?? []) as { id: string; name: string; status: string; submitted_at: string }[]).map((r) => ({
      type: 'member_application' as const,
      id: r.id,
      title: r.name,
      status: r.status,
      createdAt: r.submitted_at,
      href: `/admin/applications/${r.id}`,
    })),
  ]

  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit)
}

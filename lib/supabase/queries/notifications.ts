import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppNotification } from '@/types/database'

// notifications_select has an additive admin-override policy (0013) that
// lets cto/admin SELECT any user's notification row — added so a cto/admin
// creating a notification for someone else could read it back via
// INSERT ... RETURNING. That override is broader than what the personal
// notification bell/inbox should ever display: without an explicit
// user_id filter here, a cto/admin's own inbox silently mixes in every
// other user's notifications (and "mark all read" then silently no-ops on
// the rows they don't actually own, since the UPDATE policy has no such
// override). Every read/write below filters to the caller's own id
// explicitly, so the personal-inbox surfaces stay personal regardless of
// what else RLS additionally permits cto/admin to see.
async function currentUserId(supabase: SupabaseClient): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in.')
  return user.id
}

export async function listNotifications(supabase: SupabaseClient, limit = 30): Promise<AppNotification[]> {
  const userId = await currentUserId(supabase)
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as AppNotification[]
}

export async function countUnreadNotifications(supabase: SupabaseClient): Promise<number> {
  const userId = await currentUserId(supabase)
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null)
  if (error) throw error
  return count ?? 0
}

export async function markNotificationRead(supabase: SupabaseClient, id: string, read = true) {
  const userId = await currentUserId(supabase)
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: read ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw error
}

export async function markAllNotificationsRead(supabase: SupabaseClient) {
  const userId = await currentUserId(supabase)
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)
  if (error) throw error
}

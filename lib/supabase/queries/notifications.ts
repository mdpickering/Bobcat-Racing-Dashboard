import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppNotification } from '@/types/database'

export async function listNotifications(supabase: SupabaseClient, limit = 30): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as AppNotification[]
}

export async function countUnreadNotifications(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
  if (error) throw error
  return count ?? 0
}

export async function markNotificationRead(supabase: SupabaseClient, id: string, read = true) {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: read ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw error
}

export async function markAllNotificationsRead(supabase: SupabaseClient) {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)
  if (error) throw error
}

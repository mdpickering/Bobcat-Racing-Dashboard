import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuditLogEntry, MigrationLogEntry, MigrationException } from '@/types/database'

// audit_logs and migration_log have zero insert grant to anyone, including
// cto/admin (0011) — population is deferred to a future privileged process
// (real audit triggers, or the eventual migration script's service-role
// access). These reads are expected to come back empty until that process
// exists; that's correct, not a bug.
export async function listAuditLogs(supabase: SupabaseClient, limit = 50): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*, actor:profiles(id, display_name, email)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as unknown as AuditLogEntry[]
}

export async function listMigrationLog(supabase: SupabaseClient, limit = 50): Promise<MigrationLogEntry[]> {
  const { data, error } = await supabase.from('migration_log').select('*').order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []) as MigrationLogEntry[]
}

// migration_exceptions has two FK paths to profiles (resolved_by,
// resolved_to_profile_id), so the embed needs the FK hint to disambiguate —
// same PGRST201 class of issue as task_comments/task_requests/purchase_requests.
export async function listMigrationExceptions(supabase: SupabaseClient, resolutionStatus?: string): Promise<MigrationException[]> {
  let query = supabase
    .from('migration_exceptions')
    .select('*, resolvedToProfile:profiles!migration_exceptions_resolved_to_profile_id_fkey(id, display_name, email)')
    .order('created_at', { ascending: false })
  if (resolutionStatus) query = query.eq('resolution_status', resolutionStatus)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as MigrationException[]
}

export async function resolveMigrationException(
  supabase: SupabaseClient,
  id: string,
  patch: { resolution_status: 'resolved' | 'ignored' | 'unresolved'; resolved_to_profile_id?: string | null }
) {
  const { data, error } = await supabase.from('migration_exceptions').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as unknown as MigrationException
}

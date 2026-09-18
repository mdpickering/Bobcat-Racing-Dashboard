import { createClient } from '@/lib/supabase/server'
import { listAuditLogs, listMigrationLog, listMigrationExceptions } from '@/lib/supabase/queries/audit'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'
import { PermissionDeniedState } from '@/components/ui/ErrorState'
import ErrorState from '@/components/ui/ErrorState'
import Panel from '@/components/ui/Panel'
import EmptyState from '@/components/ui/EmptyState'
import AdminNav from '@/components/admin/AdminNav'
import MigrationExceptionsPanel from '@/components/admin/MigrationExceptionsPanel'
import { formatDateTime } from '@/lib/format'
import { History, FileClock } from 'lucide-react'

export default async function AdminAuditPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()

  if (!profile) return <ErrorState message="Could not load your profile." />
  const p = profile as Profile
  if (!isCtoOrAdmin(p)) return <PermissionDeniedState message="Audit history is limited to CTO and Admin accounts." />

  let auditLogs, migrationLog, migrationExceptions
  try {
    ;[auditLogs, migrationLog, migrationExceptions] = await Promise.all([
      listAuditLogs(supabase),
      listMigrationLog(supabase),
      listMigrationExceptions(supabase),
    ])
  } catch {
    return <ErrorState message="Could not load audit history." />
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Audit &amp; Activity</h1>
        <p className="mt-0.5 text-xs font-mono text-text-muted">Administrative history and migration bookkeeping.</p>
      </div>
      <AdminNav />

      <div>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-text-primary">Migration Exceptions</h2>
        <MigrationExceptionsPanel exceptions={migrationExceptions} />
      </div>

      <div>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-text-primary">Migration Log</h2>
        {migrationLog.length === 0 ? (
          <EmptyState icon={FileClock} title="No migration log entries" description="Populated once a future production data migration runs." />
        ) : (
          <Panel className="overflow-hidden">
            <ul className="divide-y divide-border">
              {migrationLog.map((m) => (
                <li key={m.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <span className="text-text-primary">{m.entity_type} · {m.legacy_id_or_key}</span>
                  <span className="text-text-muted">{m.status} · {formatDateTime(m.created_at)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-text-primary">Audit Log</h2>
        {auditLogs.length === 0 ? (
          <EmptyState icon={History} title="No audit log entries yet" description="Administrative actions will be recorded here in a future phase." />
        ) : (
          <Panel className="overflow-hidden">
            <ul className="divide-y divide-border">
              {auditLogs.map((a) => (
                <li key={a.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <span className="text-text-primary">
                    {a.actor?.display_name || a.actor?.email || 'Unknown'} · {a.action}
                  </span>
                  <span className="text-text-muted">{formatDateTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  )
}

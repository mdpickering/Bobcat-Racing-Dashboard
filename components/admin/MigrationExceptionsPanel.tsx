'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, RotateCcw } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { createClient } from '@/lib/supabase/client'
import { resolveMigrationException } from '@/lib/supabase/queries/audit'
import { formatDateTime } from '@/lib/format'
import { AlertOctagon } from 'lucide-react'
import type { MigrationException } from '@/types/database'

const STATUS_TONE: Record<string, 'amber' | 'emerald' | 'slate'> = {
  unresolved: 'amber',
  resolved: 'emerald',
  ignored: 'slate',
}

export default function MigrationExceptionsPanel({ exceptions }: { exceptions: MigrationException[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleResolve(id: string, status: 'resolved' | 'ignored' | 'unresolved') {
    setBusyId(id)
    setError(null)
    try {
      const supabase = createClient()
      await resolveMigrationException(supabase, id, { resolution_status: status })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this exception.')
    } finally {
      setBusyId(null)
    }
  }

  if (exceptions.length === 0) {
    return <EmptyState icon={AlertOctagon} title="No migration exceptions" description="Exceptions from a future production migration will appear here." />
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-[11px] text-rose-400">{error}</p>}
      {exceptions.map((e) => (
        <Panel key={e.id} className="p-3">
          <div className="flex items-start justify-between gap-3 text-xs">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-text-primary">{e.entity_type}</span>
                <Badge tone={STATUS_TONE[e.resolution_status]}>{e.resolution_status}</Badge>
              </div>
              {e.raw_value && <div className="mt-0.5 truncate text-[11px] text-text-secondary">{e.raw_value}</div>}
              <div className="mt-1 text-[10px] text-text-muted">{formatDateTime(e.created_at)}</div>
            </div>
            {e.resolution_status === 'unresolved' && (
              <div className="flex flex-shrink-0 gap-2">
                <button type="button" disabled={busyId === e.id} onClick={() => handleResolve(e.id, 'resolved')} title="Mark resolved" className="text-text-muted hover:text-emerald-400">
                  <Check size={14} />
                </button>
                <button type="button" disabled={busyId === e.id} onClick={() => handleResolve(e.id, 'ignored')} title="Ignore" className="text-text-muted hover:text-rose-400">
                  <X size={14} />
                </button>
              </div>
            )}
            {e.resolution_status !== 'unresolved' && (
              <button type="button" disabled={busyId === e.id} onClick={() => handleResolve(e.id, 'unresolved')} title="Reopen" className="flex-shrink-0 text-text-muted hover:text-accent-blue">
                <RotateCcw size={13} />
              </button>
            )}
          </div>
        </Panel>
      ))}
    </div>
  )
}

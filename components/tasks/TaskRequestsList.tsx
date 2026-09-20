'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Panel from '@/components/ui/Panel'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { reviewTaskRequest } from '@/lib/supabase/queries/tasks'
import { formatDate } from '@/lib/format'
import { getErrorMessage } from '@/lib/errors'
import type { TaskRequest } from '@/types/database'
import { Inbox } from 'lucide-react'

const STATUS_TONE = { pending: 'amber', approved: 'emerald', declined: 'rose' } as const

interface TaskRequestsListProps {
  requests: TaskRequest[]
  // cto/admin may review every request; a team lead only those of subsystems they lead.
  // Mirrors canReviewTaskRequest() in lib/permissions/roles.ts — the database re-checks it.
  canReviewAll: boolean
  reviewableSubsystemIds: string[]
}

export default function TaskRequestsList({ requests, canReviewAll, reviewableSubsystemIds }: TaskRequestsListProps) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleReview(request: TaskRequest, status: 'approved' | 'declined') {
    setBusyId(request.id)
    setError(null)
    try {
      const supabase = createClient()
      // One database call: it re-checks authorization, creates the task on approval and
      // records the review atomically (no orphan task if the review step fails).
      await reviewTaskRequest(supabase, request.id, status)
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update this request.'))
    } finally {
      setBusyId(null)
    }
  }

  if (requests.length === 0) {
    return <EmptyState icon={Inbox} title="No task requests yet" />
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-rose-400">{error}</p>}
      {requests.map((r) => (
        <Panel key={r.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-text-primary">{r.title}</h3>
                <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
              </div>
              <p className="mt-1 text-[10px] text-text-muted">
                {r.requester?.display_name || r.requester?.email} · {r.subsystem?.name} · {formatDate(r.created_at)}
              </p>
              {r.description && <p className="mt-2 text-[11px] text-text-secondary">{r.description}</p>}
              {r.status === 'approved' && r.converted_task_id && (
                <Link href={`/tasks/${r.converted_task_id}`} className="mt-2 inline-block text-[11px] text-accent-blue hover:underline">
                  View task →
                </Link>
              )}
            </div>
            {(canReviewAll || reviewableSubsystemIds.includes(r.subsystem_id)) && r.status === 'pending' && (
              <div className="flex flex-shrink-0 gap-2">
                <Button size="sm" variant="secondary" disabled={busyId === r.id} onClick={() => handleReview(r, 'declined')}>
                  Decline
                </Button>
                <Button size="sm" disabled={busyId === r.id} onClick={() => handleReview(r, 'approved')}>
                  Approve
                </Button>
              </div>
            )}
          </div>
        </Panel>
      ))}
    </div>
  )
}

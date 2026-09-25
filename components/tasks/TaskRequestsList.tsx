'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Inbox } from 'lucide-react'
import StatusBadge from '@/components/ui/StatusBadge'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { createClient } from '@/lib/supabase/client'
import { reviewTaskRequest } from '@/lib/supabase/queries/tasks'
import { formatDate } from '@/lib/format'
import { getErrorMessage } from '@/lib/errors'
import type { TaskRequest } from '@/types/database'

const STATUS_TONE = { pending: 'warning', approved: 'success', declined: 'danger' } as const

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
    return <EmptyState icon={Inbox} title="No task requests yet" description="Anyone on the team can request a task for a subsystem. Requests appear here for review." />
  }

  return (
    <div>
      {error && <p className="mb-2 text-xs text-status-danger">{error}</p>}
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {requests.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-text-primary">{r.title}</h3>
                <StatusBadge tone={STATUS_TONE[r.status]}>{r.status}</StatusBadge>
              </div>
              <p className="mt-0.5 text-xs text-text-muted">
                {r.requester?.display_name || r.requester?.email} · {r.subsystem?.name} · {formatDate(r.created_at)}
              </p>
              {r.description && <p className="mt-1.5 text-xs text-text-secondary">{r.description}</p>}
              {r.status === 'approved' && r.converted_task_id && (
                <Link href={`/tasks/${r.converted_task_id}`} className="mt-1.5 inline-block text-xs text-accent-blue hover:underline">
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
          </li>
        ))}
      </ul>
    </div>
  )
}
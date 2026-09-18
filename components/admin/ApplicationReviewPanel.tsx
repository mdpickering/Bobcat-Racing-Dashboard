'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { reviewMemberApplication, adminSetUserApproved } from '@/lib/supabase/queries/admin'
import type { MemberApplication } from '@/types/database'

export default function ApplicationReviewPanel({ application, currentUserId }: { application: MemberApplication; currentUserId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleReview(status: 'approved' | 'rejected') {
    setBusy(status === 'approved' ? 'approve' : 'reject')
    setError(null)
    try {
      const supabase = createClient()
      await reviewMemberApplication(supabase, application.id, status, currentUserId)
      if (status === 'approved' && application.linked_profile_id) {
        await adminSetUserApproved(supabase, application.linked_profile_id, true)
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not review this application.')
    } finally {
      setBusy(null)
    }
  }

  if (application.status !== 'pending') {
    return (
      <Panel className="p-4 text-xs text-text-muted">
        Reviewed by {application.reviewer?.display_name || application.reviewer?.email || 'unknown'}
        {application.reviewed_at ? ` on ${new Date(application.reviewed_at).toLocaleDateString()}` : ''}.
      </Panel>
    )
  }

  return (
    <Panel className="p-4">
      {error && <p className="mb-2 text-[11px] text-rose-400">{error}</p>}
      {!application.linked_profile_id && (
        <p className="mb-2 text-[11px] text-amber-400">
          This application has no linked profile — approving it will update the review record but cannot approve a profile.
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy !== null} onClick={() => handleReview('approved')}>
          <Check size={12} /> {busy === 'approve' ? 'Approving…' : 'Approve'}
        </Button>
        <Button size="sm" variant="danger" disabled={busy !== null} onClick={() => handleReview('rejected')}>
          <X size={12} /> {busy === 'reject' ? 'Rejecting…' : 'Reject'}
        </Button>
      </div>
    </Panel>
  )
}

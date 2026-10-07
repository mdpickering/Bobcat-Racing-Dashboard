'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Play, CheckCircle2, RotateCcw, Trash2 } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import StatusBadge from '@/components/ui/StatusBadge'
import Button from '@/components/ui/Button'
import Textarea from '@/components/ui/Textarea'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { updateMeeting, deleteMeeting } from '@/lib/supabase/queries/meetings'
import { getErrorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { formatDeadline } from '@/lib/deadline'
import type { TechnicalMeeting } from '@/types/database'

interface MeetingHeaderBarProps {
  meeting: TechnicalMeeting
  canManage: boolean
  canRecord: boolean
}

export default function MeetingHeaderBar({ meeting, canManage, canRecord }: MeetingHeaderBarProps) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [summaryNotes, setSummaryNotes] = useState(meeting.summary_notes ?? '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [showSummaryBox, setShowSummaryBox] = useState(Boolean(meeting.summary_notes) || meeting.status === 'completed')

  async function setStatus(status: string) {
    setBusy(true)
    try {
      await updateMeeting(createClient(), meeting.id, { status })
      router.refresh()
    } catch (err) {
      toast.push(getErrorMessage(err, 'Could not update this meeting.'), 'danger')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    setDeleteError(null)
    try {
      await deleteMeeting(createClient(), meeting.id)
      toast.push('Meeting deleted.', 'success')
      router.push('/meetings')
      router.refresh()
    } catch (err) {
      setDeleteError(getErrorMessage(err, 'Could not delete this meeting.'))
      setBusy(false)
    }
  }

  async function saveSummaryNotes() {
    setSavingNotes(true)
    try {
      await updateMeeting(createClient(), meeting.id, { summary_notes: summaryNotes })
      toast.push('Summary saved.', 'success')
      router.refresh()
    } catch (err) {
      toast.push(getErrorMessage(err, 'Could not save the summary.'), 'danger')
    } finally {
      setSavingNotes(false)
    }
  }

  return (
    <div className="mb-4">
      <PageHeader
        title={meeting.title}
        back={{ label: 'All meetings', href: '/meetings' }}
        description={
          <span>
            {formatDeadline(meeting.meeting_date)}
            {meeting.start_time ? ` · ${meeting.start_time.slice(0, 5)}` : ''}
            {meeting.started_at && meeting.ended_at ? ` · ran ${formatDateTime(meeting.started_at)} to ${formatDateTime(meeting.ended_at)}` : ''}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge domain="meeting" value={meeting.status}>
              {meeting.status === 'in_progress' ? 'In progress' : meeting.status[0].toUpperCase() + meeting.status.slice(1)}
            </StatusBadge>
            {canManage && meeting.status === 'planned' && (
              <Button size="sm" disabled={busy} onClick={() => setStatus('in_progress')}>
                <Play size={12} /> Start meeting
              </Button>
            )}
            {canManage && meeting.status === 'in_progress' && (
              <Button size="sm" disabled={busy} onClick={() => setStatus('completed')}>
                <CheckCircle2 size={12} /> Complete meeting
              </Button>
            )}
            {canManage && meeting.status === 'completed' && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setStatus('in_progress')}>
                <RotateCcw size={12} /> Reopen
              </Button>
            )}
            {canManage && meeting.status === 'planned' && (
              <Button aria-label="Delete this draft meeting" size="sm" variant="danger" disabled={busy} onClick={() => { setDeleteError(null); setConfirmOpen(true) }}>
                <Trash2 size={12} />
              </Button>
            )}
          </div>
        }
      />
      {canRecord && showSummaryBox ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          <label className="mb-1.5 block text-xs font-semibold text-text-primary">Meeting summary</label>
          <Textarea
            rows={3}
            value={summaryNotes}
            onChange={(e) => setSummaryNotes(e.target.value)}
            placeholder="Key decisions, what was covered, what's still open…"
          />
          {summaryNotes !== (meeting.summary_notes ?? '') && (
            <div className="mt-2 flex justify-end">
              <Button size="sm" disabled={savingNotes} onClick={saveSummaryNotes}>
                {savingNotes ? 'Saving…' : 'Save summary'}
              </Button>
            </div>
          )}
        </div>
      ) : canRecord ? (
        <button type="button" onClick={() => setShowSummaryBox(true)} className="text-2xs text-text-muted hover:text-accent-blue">
          + Add a meeting summary
        </button>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Delete this draft meeting?"
        busy={busy}
        error={deleteError}
        description={<p>This only works while the meeting has no notes, decisions or action items. A meeting with content is kept as history.</p>}
      />
    </div>
  )
}

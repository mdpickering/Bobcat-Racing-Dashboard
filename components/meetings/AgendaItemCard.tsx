'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, ArrowDown, ArrowUp, Trash2, Plus } from 'lucide-react'
import Button from '@/components/ui/Button'
import Textarea from '@/components/ui/Textarea'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import StatusBadge from '@/components/ui/StatusBadge'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { deleteAgendaItem, updateAgendaItem } from '@/lib/supabase/queries/meetings'
import { getErrorMessage } from '@/lib/errors'
import type { TechnicalMeetingActionItem, TechnicalMeetingAgendaItem } from '@/types/database'
import ActionItemRow from './ActionItemRow'

interface AgendaItemCardProps {
  item: TechnicalMeetingAgendaItem
  actionItems: TechnicalMeetingActionItem[]
  canManage: boolean
  canEditNow: boolean
  neighbours: { prev: TechnicalMeetingAgendaItem | null; next: TechnicalMeetingAgendaItem | null }
  onMove: (direction: 'up' | 'down') => void
  onAddActionItem: () => void
  onEditActionItem: (item: TechnicalMeetingActionItem) => void
}

export default function AgendaItemCard({ item, actionItems, canManage, canEditNow, neighbours, onMove, onAddActionItem, onEditActionItem }: AgendaItemCardProps) {
  const router = useRouter()
  const toast = useToast()
  const [expanded, setExpanded] = useState(Boolean(item.discussion_notes || item.decision))
  const [notes, setNotes] = useState(item.discussion_notes ?? '')
  const [decision, setDecision] = useState(item.decision ?? '')
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const dirty = notes !== (item.discussion_notes ?? '') || decision !== (item.decision ?? '')

  async function saveNotes() {
    setBusy(true)
    try {
      await updateAgendaItem(createClient(), item.id, { discussion_notes: notes, decision })
      router.refresh()
    } catch (err) {
      toast.push(getErrorMessage(err, 'Could not save these notes.'), 'danger')
    } finally {
      setBusy(false)
    }
  }

  async function setItemStatus(status: string) {
    setBusy(true)
    try {
      await updateAgendaItem(createClient(), item.id, { status })
      router.refresh()
    } catch (err) {
      toast.push(getErrorMessage(err, 'Could not update this topic.'), 'danger')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    setDeleteError(null)
    try {
      await deleteAgendaItem(createClient(), item.id)
      setConfirmOpen(false)
      router.refresh()
    } catch (err) {
      setDeleteError(getErrorMessage(err, 'Could not remove this topic.'))
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button type="button" onClick={() => setExpanded((e) => !e)} className="flex min-w-0 flex-1 items-start gap-2 text-left">
          {expanded ? <ChevronUp size={15} className="mt-0.5 flex-shrink-0 text-text-muted" /> : <ChevronDown size={15} className="mt-0.5 flex-shrink-0 text-text-muted" />}
          <span className="min-w-0 text-sm font-semibold text-text-primary">{item.title}</span>
        </button>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <StatusBadge domain="meetingAgendaItem" value={item.status} />
          {canManage && (
            <>
              <Button aria-label={`Move ${item.title} up`} size="sm" variant="ghost" disabled={!neighbours.prev} onClick={() => onMove('up')}>
                <ArrowUp size={12} />
              </Button>
              <Button aria-label={`Move ${item.title} down`} size="sm" variant="ghost" disabled={!neighbours.next} onClick={() => onMove('down')}>
                <ArrowDown size={12} />
              </Button>
              <Button aria-label={`Remove topic ${item.title}`} size="sm" variant="ghost" disabled={busy} onClick={() => { setDeleteError(null); setConfirmOpen(true) }}>
                <Trash2 size={12} />
              </Button>
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {canEditNow ? (
            <>
              <div className="flex gap-2">
                {(['open', 'discussed', 'deferred'] as const).map((s) => (
                  <Button key={s} size="sm" variant={item.status === s ? 'primary' : 'secondary'} disabled={busy} onClick={() => setItemStatus(s)}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </Button>
                ))}
              </div>
              <div>
                <label className="mb-1 block text-2xs font-semibold text-text-secondary">Discussion notes</label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was discussed…" />
              </div>
              <div>
                <label className="mb-1 block text-2xs font-semibold text-text-secondary">Decision</label>
                <Textarea rows={2} value={decision} onChange={(e) => setDecision(e.target.value)} placeholder="What was decided…" />
              </div>
              {dirty && (
                <div className="flex justify-end">
                  <Button size="sm" disabled={busy} onClick={saveNotes}>
                    {busy ? 'Saving…' : 'Save notes'}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              {item.discussion_notes && (
                <div>
                  <p className="mb-0.5 text-2xs font-semibold text-text-secondary">Discussion notes</p>
                  <p className="whitespace-pre-wrap text-xs text-text-primary">{item.discussion_notes}</p>
                </div>
              )}
              {item.decision && (
                <div>
                  <p className="mb-0.5 text-2xs font-semibold text-text-secondary">Decision</p>
                  <p className="whitespace-pre-wrap text-xs text-text-primary">{item.decision}</p>
                </div>
              )}
            </>
          )}

          {actionItems.length > 0 && (
            <div className="space-y-1.5">
              {actionItems.map((a) => (
                <ActionItemRow key={a.id} item={a} canEditNow={canEditNow} canManage={canManage} onEdit={() => onEditActionItem(a)} />
              ))}
            </div>
          )}
          {canEditNow && (
            <button type="button" onClick={onAddActionItem} className="flex items-center gap-1 text-2xs text-text-muted hover:text-accent-blue">
              <Plus size={11} /> Add action item
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Remove agenda topic?"
        confirmLabel="Remove"
        busyLabel="Removing…"
        busy={busy}
        error={deleteError}
        description={<p>&ldquo;{item.title}&rdquo; and any notes recorded under it will be removed from this agenda.</p>}
      />
    </div>
  )
}

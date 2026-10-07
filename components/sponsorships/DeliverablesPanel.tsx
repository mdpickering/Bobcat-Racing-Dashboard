'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardCheck, Pencil, Plus } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import StatusBadge from '@/components/ui/StatusBadge'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import ReadOnlyNotice from '@/components/ui/ReadOnlyNotice'
import { ProgressBar } from '@/components/ui/Charts'
import { createClient } from '@/lib/supabase/client'
import { addDeliverable, deleteDeliverable, updateDeliverable } from '@/lib/supabase/queries/sponsorships'
import { getErrorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { todayDateKey } from '@/lib/deadline'
import { DELIVERABLE_STATUSES, DELIVERABLE_STATUS_LABEL, deliverableProgressLabel, formatContributionDate, isDeliverableOverdue } from '@/lib/sponsorships'
import { statusTone } from '@/lib/status'
import type { DeliverableStatus, LevelDecisionMethod, SponsorshipDeliverable, SponsorshipLevel } from '@/types/database'

interface DeliverablesPanelProps {
  sponsorshipId: string
  level: SponsorshipLevel | null
  decisionMethod: LevelDecisionMethod | null
  deliverables: SponsorshipDeliverable[]
  canManage: boolean
  currentUserId: string
  businessMembers: { user_id: string; name: string }[]
}

const personName = (p: { display_name: string | null; email: string | null } | null | undefined) => p?.display_name || p?.email || null

// What each sponsor is owed and where it stands. The list itself is created by the database (a standard level copies
// the level's checklist in; a custom sponsorship has its own, added by hand), and the database decides who may change
// what: managers change anything, the assigned Business member changes only status and notes, everyone else reads.
export default function DeliverablesPanel({ sponsorshipId, level, decisionMethod, deliverables, canManage, currentUserId, businessMembers }: DeliverablesPanelProps) {
  const router = useRouter()
  const [today, setToday] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<SponsorshipDeliverable | null>(null)
  const [adding, setAdding] = useState(false)

  // the viewer's own calendar date, read after mount so the server and browser render identically
  useEffect(() => setToday(todayDateKey()), [])

  const hasDecision = decisionMethod !== null && decisionMethod !== 'historical_unassigned'
  const isCustom = decisionMethod === 'custom'
  const completed = deliverables.filter((d) => d.status === 'complete').length
  const mineOpen = deliverables.some((d) => d.assigned_to === currentUserId)

  async function changeStatus(d: SponsorshipDeliverable, status: DeliverableStatus) {
    if (status === d.status || savingId) return
    setSavingId(d.id)
    setError(null)
    try {
      await updateDeliverable(createClient(), d.id, { status })
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update that deliverable.'))
    } finally {
      setSavingId(null)
    }
  }

  const header = (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
        <ClipboardCheck size={13} className="text-accent-blue" /> Deliverables
      </h2>
      {canManage && hasDecision && (
        <Button size="sm" variant="secondary" onClick={() => { setError(null); setAdding(true) }}>
          <Plus size={12} /> Add deliverable
        </Button>
      )}
    </div>
  )

  // Historical records and sponsorships not yet levelled have no obligations recorded: say so plainly, and never show 0 / 0.
  if (!hasDecision) {
    return (
      <Panel className="p-4">
        {header}
        <p className="text-[12px] text-text-muted">Deliverables will appear when a sponsorship level is assigned.</p>
        {decisionMethod === 'historical_unassigned' && (
          <p className="mt-1 text-[12px] text-text-muted">This is a historical record: no level was assigned and none was invented, so no deliverables were created.</p>
        )}
      </Panel>
    )
  }

  return (
    <Panel className="p-4">
      {header}

      {deliverables.length > 0 && (
        <div className="mb-4">
          <ProgressBar value={completed} total={deliverables.length} label={level ? `${level.name} deliverables` : 'Custom deliverables'} valueLabel={deliverableProgressLabel({ completed, total: deliverables.length })} />
        </div>
      )}

      {error && !adding && !editing && <p className="mb-2 text-xs text-status-danger">{error}</p>}
      {!canManage && !mineOpen && deliverables.length > 0 && (
        <div className="mb-3">
          <ReadOnlyNotice>Only the Sponsorship Lead, the Business Lead and an admin can change deliverables. A Business member can update the ones assigned to them.</ReadOnlyNotice>
        </div>
      )}

      {deliverables.length === 0 ? (
        <p className="text-[12px] text-text-muted">
          {isCustom
            ? canManage
              ? 'This is a custom sponsorship, so it has no standard deliverables. Add the ones it was promised.'
              : 'This is a custom sponsorship. Its deliverables have not been defined yet.'
            : 'No deliverables are recorded for this sponsorship.'}
        </p>
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className="border-b border-border text-2xs font-medium text-text-muted">
                <th scope="col" className="py-2 pr-2 font-medium">Deliverable</th>
                <th scope="col" className="px-2 py-2 font-medium">Status</th>
                <th scope="col" className="px-2 py-2 font-medium">Assigned to</th>
                <th scope="col" className="px-2 py-2 font-medium">Due</th>
                <th scope="col" className="px-2 py-2 font-medium">Completed</th>
                <th scope="col" className="py-2 pl-2 text-right font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {deliverables.map((d) => {
                const isMine = d.assigned_to === currentUserId
                const canEditStatus = canManage || isMine
                const overdue = isDeliverableOverdue(d, today)
                return (
                  <tr key={d.id} className="align-top">
                    <td className="py-2.5 pr-2">
                      <div className="font-medium text-text-primary">{d.title}</div>
                      {d.source === 'custom' && <div className="text-2xs text-text-muted">Custom</div>}
                      {d.notes && <div className="mt-0.5 max-w-xs whitespace-pre-wrap text-2xs text-text-muted">{d.notes}</div>}
                    </td>
                    <td className="px-2 py-2.5">
                      {canEditStatus ? (
                        <Select
                          aria-label={`Status of ${d.title}`}
                          value={d.status}
                          disabled={savingId === d.id}
                          onChange={(e) => changeStatus(d, e.target.value as DeliverableStatus)}
                          className="!w-auto !py-1"
                        >
                          {DELIVERABLE_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {DELIVERABLE_STATUS_LABEL[s]}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <StatusBadge tone={statusTone('deliverable', d.status)}>{DELIVERABLE_STATUS_LABEL[d.status]}</StatusBadge>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-text-secondary">
                      {personName(d.assignee) ?? <span className="text-text-muted">Unassigned</span>}
                      {isMine && <span className="ml-1 text-2xs text-text-muted">(you)</span>}
                    </td>
                    <td className="px-2 py-2.5">
                      {d.due_date ? (
                        <span className={overdue ? 'font-medium text-status-danger' : 'text-text-secondary'}>
                          {formatContributionDate(d.due_date, 'day')}
                          {overdue && <span className="ml-1 text-2xs">Overdue</span>}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-text-secondary">
                      {d.status === 'complete' && d.completed_at ? (
                        <>
                          {formatDate(d.completed_at)}
                          {personName(d.completer) && <div className="text-2xs text-text-muted">by {personName(d.completer)}</div>}
                        </>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pl-2 text-right">
                      {(canManage || isMine) && (
                        <Button size="sm" variant="ghost" onClick={() => { setError(null); setEditing(d) }} aria-label={`${canManage ? 'Edit' : 'Add notes to'} ${d.title}`}>
                          <Pencil size={12} /> {canManage ? 'Edit' : 'Notes'}
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <DeliverableFormModal
          key="add"
          mode="add"
          sponsorshipId={sponsorshipId}
          businessMembers={businessMembers}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); router.refresh() }}
        />
      )}
      {editing && (
        <DeliverableFormModal
          key={editing.id}
          mode={canManage ? 'manage' : 'notes'}
          sponsorshipId={sponsorshipId}
          deliverable={editing}
          businessMembers={businessMembers}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh() }}
        />
      )}
    </Panel>
  )
}

interface FormProps {
  mode: 'add' | 'manage' | 'notes'
  sponsorshipId: string
  deliverable?: SponsorshipDeliverable
  businessMembers: { user_id: string; name: string }[]
  onClose: () => void
  onSaved: () => void
}

// add / edit for managers; notes-only for the assigned member (the fields they may not change are not even shown).
function DeliverableFormModal({ mode, sponsorshipId, deliverable, businessMembers, onClose, onSaved }: FormProps) {
  const [title, setTitle] = useState(deliverable?.title ?? '')
  const [assignee, setAssignee] = useState(deliverable?.assigned_to ?? '')
  const [dueDate, setDueDate] = useState(deliverable?.due_date?.slice(0, 10) ?? '')
  const [notes, setNotes] = useState(deliverable?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // keep a current assignee who is no longer selectable (left the team) visible rather than silently dropping them
  const assigneeMissing = !!assignee && !businessMembers.some((m) => m.user_id === assignee)
  const heading = mode === 'add' ? 'Add a deliverable' : mode === 'manage' ? 'Edit deliverable' : `Notes: ${deliverable?.title}`

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (mode !== 'notes' && !title.trim()) return
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      if (mode === 'add') {
        await addDeliverable(supabase, { sponsorship_id: sponsorshipId, title, assigned_to: assignee || null, due_date: dueDate || null, notes })
      } else if (mode === 'manage' && deliverable) {
        await updateDeliverable(supabase, deliverable.id, {
          ...(title.trim() !== deliverable.title ? { title: title.trim() } : {}),
          ...((assignee || null) !== deliverable.assigned_to ? { assigned_to: assignee || null } : {}),
          ...((dueDate || null) !== (deliverable.due_date?.slice(0, 10) ?? null) ? { due_date: dueDate || null } : {}),
          notes: notes.trim() || null,
        })
      } else if (deliverable) {
        await updateDeliverable(supabase, deliverable.id, { notes: notes.trim() || null })
      }
      onSaved()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save this deliverable.'))
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!deliverable) return
    setBusy(true)
    setError(null)
    try {
      await deleteDeliverable(createClient(), deliverable.id)
      onSaved()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not remove this deliverable.'))
      setBusy(false)
    }
  }

  return (
    <>
      <Modal open={!confirmDelete} onClose={busy ? () => {} : onClose} title={heading} maxWidthClassName="max-w-md">
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          {mode !== 'notes' && (
            <div>
              <label htmlFor="deliverable-title" className="mb-1 block text-xs text-text-secondary">Deliverable</label>
              <Input id="deliverable-title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} placeholder="e.g. Logo on the trailer" autoFocus={mode === 'add'} />
            </div>
          )}
          {mode !== 'notes' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="deliverable-assignee" className="mb-1 block text-xs text-text-secondary">Assigned to</label>
                <Select id="deliverable-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={busy}>
                  <option value="">Unassigned</option>
                  {assigneeMissing && <option value={assignee}>{deliverable?.assignee?.display_name || deliverable?.assignee?.email || 'Current assignee'} (no longer on the team)</option>}
                  {businessMembers.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label htmlFor="deliverable-due" className="mb-1 block text-xs text-text-secondary">Due date</label>
                <Input id="deliverable-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={busy} />
              </div>
            </div>
          )}
          <div>
            <label htmlFor="deliverable-notes" className="mb-1 block text-xs text-text-secondary">Notes</label>
            <Textarea id="deliverable-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy} autoFocus={mode === 'notes'} />
          </div>
          {mode !== 'notes' && <p className="text-[12px] text-text-muted">Only active Business team members can be assigned. The person is notified when a deliverable is assigned to them.</p>}
          {mode === 'notes' && <p className="text-[12px] text-text-muted">You can update the status and notes of a deliverable assigned to you. The Sponsorship Lead or Business Lead can change anything else.</p>}
          {error && <p className="text-status-danger">{error}</p>}
          <div className="flex items-center justify-between gap-2">
            <div>
              {mode === 'manage' && (
                <Button type="button" variant="danger" size="sm" disabled={busy} onClick={() => setConfirmDelete(true)}>
                  Remove
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || (mode !== 'notes' && !title.trim())}>
                {busy ? 'Saving…' : mode === 'add' ? 'Add deliverable' : 'Save'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Remove this deliverable?"
        description={
          <>
            <p>“{deliverable?.title}” will be removed from this sponsorship. The removal is recorded in the sponsorship history.</p>
            <p>Only remove a deliverable that was added by mistake or is no longer promised. Completed deliverables can only be removed by an admin.</p>
          </>
        }
        confirmLabel="Remove"
        busyLabel="Removing…"
        busy={busy}
        error={error}
      />
    </>
  )
}

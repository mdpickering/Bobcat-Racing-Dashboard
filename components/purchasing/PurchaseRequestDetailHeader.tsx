'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Pencil, Check, X, Trash2, BadgeCheck, FileSpreadsheet } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import PurchaseStatusBadge, { ALL_PURCHASE_STATUSES } from './PurchaseStatusBadge'
import { createClient } from '@/lib/supabase/client'
import { updatePurchaseRequest, deletePurchaseRequest, approvePurchaseRequest } from '@/lib/supabase/queries/purchasing'
import { formatDate } from '@/lib/format'
import { getErrorMessage } from '@/lib/errors'
import { broadcastNotificationsChanged } from '@/lib/notificationEvents'
import type { PurchaseRequest, PurchaseStatus } from '@/types/database'

interface PurchaseRequestDetailHeaderProps {
  request: PurchaseRequest
  canManage: boolean
  canApprove: boolean
  // cto/admin (any non-imported request) or the creator while it is still a Draft — the
  // database enforces the same rule; this only decides whether to show the button.
  canDelete: boolean
  itemCount: number
}

export default function PurchaseRequestDetailHeader({ request, canManage, canApprove, canDelete, itemCount }: PurchaseRequestDetailHeaderProps) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [approveOpen, setApproveOpen] = useState(false)
  const [approving, setApproving] = useState(false)
  const [approveError, setApproveError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(request.title)
  const [description, setDescription] = useState(request.description ?? '')
  const [vendor, setVendor] = useState(request.vendor ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Approval is its own explicit action (the "Approve Purchase" button) — the database rejects a
  // plain status edit to 'Approved' for everyone, so it is never offered here. Rejecting stays a
  // status change but only CTO/Admin can do it (a hard DB error otherwise), so a lead never sees
  // it. The request's current status is always included even if it's outside that set (e.g. a
  // lead viewing an already-Approved request) — otherwise a <select> whose value isn't among its
  // options silently falls back to displaying the first option, making the dropdown lie about the
  // actual status.
  const selectableStatuses = ALL_PURCHASE_STATUSES.filter((s) => {
    if (s === request.status) return true
    if (s === 'Approved') return false
    if (s === 'Rejected') return canApprove
    return true
  })
  const isApprovable = canApprove && (request.status === 'Submitted' || request.status === 'Under Review')

  async function persist(patch: Record<string, unknown>) {
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      await updatePurchaseRequest(supabase, request.id, patch)
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save changes.'))
    } finally {
      setSaving(false)
    }
  }

  async function handleApprove() {
    setApproving(true)
    setApproveError(null)
    try {
      const supabase = createClient()
      await approvePurchaseRequest(supabase, request.id)
      setApproveOpen(false)
      broadcastNotificationsChanged()
      router.refresh()
    } catch (err) {
      setApproveError(getErrorMessage(err, 'Could not approve this purchase request.'))
    } finally {
      setApproving(false)
    }
  }

  async function handleStatusChange(status: string) {
    await persist({ status: status as PurchaseStatus })
  }

  async function handleSaveDetails() {
    await persist({ title, description: description || null, vendor: vendor || null })
    setEditing(false)
  }

  async function handleDelete() {
    setDeleting(true)
    setDeleteError(null)
    try {
      const supabase = createClient()
      await deletePurchaseRequest(supabase, request.id)
      // the database also removes notifications that pointed at this request
      broadcastNotificationsChanged()
      router.push('/purchasing')
      router.refresh()
    } catch (err) {
      setDeleteError(getErrorMessage(err, 'Could not delete this purchase request.'))
      setDeleting(false)
    }
  }

  return (
    <Panel className="p-5">
      <Link href="/purchasing" className="mb-3 flex items-center gap-1 text-[11px] text-text-muted hover:text-accent-blue">
        <ChevronLeft size={13} /> Back to purchasing
      </Link>

      {error && <p className="mb-2 text-xs text-rose-400">{error}</p>}

      {editing ? (
        <div className="space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-sm font-bold" />
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
          <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor" />
          <div className="flex gap-2">
            <Button size="sm" disabled={saving} onClick={handleSaveDetails}>
              <Check size={12} /> Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              <X size={12} /> Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-base font-bold text-text-primary">{request.title}</h1>
            {canManage && (
              <button type="button" onClick={() => setEditing(true)} className="flex-shrink-0 text-text-muted hover:text-accent-blue">
                <Pencil size={14} />
              </button>
            )}
          </div>
          {request.description && <p className="mt-2 whitespace-pre-wrap text-xs text-text-secondary">{request.description}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px]">
            <Badge tone="slate">{request.subsystem?.name ?? 'Unknown subsystem'}</Badge>
            {request.vendor && <Badge tone="slate">{request.vendor}</Badge>}
            <span className="text-text-muted">Requested by {request.requester?.display_name || request.requester?.email} · {formatDate(request.created_at)}</span>
            {request.reviewer && (
              <span className="text-text-muted">
                · Reviewed by {request.reviewer.display_name || request.reviewer.email}
                {request.reviewed_at ? ` (${formatDate(request.reviewed_at)})` : ''}
              </span>
            )}
          </div>
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Status</label>
          {canManage ? (
            <Select value={request.status} disabled={saving} onChange={(e) => handleStatusChange(e.target.value)} className="w-44">
              {selectableStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          ) : (
            <PurchaseStatusBadge status={request.status} />
          )}
        </div>
        {isApprovable && (
          <Button size="sm" onClick={() => { setApproveError(null); setApproveOpen(true) }}>
            <BadgeCheck size={13} /> Approve Purchase
          </Button>
        )}
        {canApprove && request.status === 'Draft' && (
          <span className="text-[11px] text-text-muted">Submit this request before it can be approved.</span>
        )}
        <a
          href={`/api/purchasing/${request.id}/sheet`}
          download
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-raised px-2.5 py-1.5 font-mono text-[11px] font-semibold text-text-primary transition-all hover:bg-border/60"
        >
          <FileSpreadsheet size={13} /> Download Purchase Sheet
        </a>
        {canDelete && (
          <Button size="sm" variant="danger" className="ml-auto" onClick={() => { setDeleteError(null); setConfirmOpen(true) }}>
            <Trash2 size={12} /> Delete
          </Button>
        )}
      </div>

      <Modal open={approveOpen} onClose={approving ? () => {} : () => setApproveOpen(false)} title="Approve this purchase?" maxWidthClassName="max-w-sm">
        <div className="space-y-4 text-xs">
          <div className="space-y-2 text-text-secondary">
            <p>
              <span className="font-semibold text-text-primary">{request.title}</span> ({request.status}) will be marked Approved and recorded as approved by you.
            </p>
            <p>The requester and the status history will show this approval.</p>
          </div>
          {approveError && <p className="text-rose-400">{approveError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={approving} onClick={() => setApproveOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={approving} onClick={handleApprove}>
              {approving ? 'Approving…' : 'Approve Purchase'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Delete purchase request?"
        busy={deleting}
        error={deleteError}
        description={
          <>
            <p>
              <span className="font-semibold text-text-primary">{request.title}</span> ({request.status}) will be permanently deleted.
            </p>
            <p>
              This also removes its {itemCount} line item{itemCount === 1 ? '' : 's'}, its status history and any notifications about it. This cannot be undone.
            </p>
          </>
        }
      />
    </Panel>
  )
}

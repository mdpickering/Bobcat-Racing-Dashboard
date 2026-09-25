'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Pencil, Check, X, Trash2, BadgeCheck, FileSpreadsheet } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import Textarea from '@/components/ui/Textarea'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import PurchaseStatusBadge from './PurchaseStatusBadge'
import { createClient } from '@/lib/supabase/client'
import { updatePurchaseRequest, deletePurchaseRequest, approvePurchaseRequest } from '@/lib/supabase/queries/purchasing'
import { formatDate } from '@/lib/format'
import { getErrorMessage } from '@/lib/errors'
import { broadcastNotificationsChanged } from '@/lib/notificationEvents'
import { statusActions, type StatusAction } from '@/lib/purchaseWorkflow'
import { isExportableStatus, purchaseSheetFileName } from '@/lib/purchaseSheet/format'
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
  const [pendingAction, setPendingAction] = useState<StatusAction | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(request.title)
  const [description, setDescription] = useState(request.description ?? '')
  const [vendor, setVendor] = useState(request.vendor ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Next-step buttons instead of a status dropdown. Approval is its own explicit action (the database
  // rejects a plain status edit to 'Approved' for everyone) and downloads the purchase sheet as soon as
  // it succeeds. These only decide what to show; the database still decides who may do what.
  const actions = statusActions(request.status, { canManage, canApprove })
  const canDownload = isExportableStatus(request.status)

  async function persist(patch: Record<string, unknown>) {
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      await updatePurchaseRequest(supabase, request.id, patch)
      broadcastNotificationsChanged()
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save changes.'))
    } finally {
      setSaving(false)
    }
  }

  // Fetches the generated .xlsx and hands it to the browser as a file download.
  async function downloadSheet() {
    const res = await fetch(`/api/purchasing/${request.id}/sheet`)
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      throw new Error(body?.error ?? 'Could not generate the purchase sheet.')
    }
    const url = URL.createObjectURL(await res.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = purchaseSheetFileName(request.id)
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  async function handleDownloadClick() {
    setDownloading(true)
    setError(null)
    try {
      await downloadSheet()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not download the purchase sheet.'))
    } finally {
      setDownloading(false)
    }
  }

  async function handleApprove() {
    setApproving(true)
    setApproveError(null)
    try {
      const supabase = createClient()
      await approvePurchaseRequest(supabase, request.id)
    } catch (err) {
      setApproveError(getErrorMessage(err, 'Could not approve this purchase request.'))
      setApproving(false)
      return
    }
    // Approved: close the dialog, refresh, and generate the sheet. If only the download fails the
    // approval still stands, and the Download Purchase Sheet button is right there.
    setApproveOpen(false)
    broadcastNotificationsChanged()
    router.refresh()
    try {
      await downloadSheet()
    } catch (err) {
      setError(`Approved — but the purchase sheet could not be downloaded (${getErrorMessage(err, 'unknown error')}). Use Download Purchase Sheet to try again.`)
    } finally {
      setApproving(false)
    }
  }

  async function handleAction(action: StatusAction) {
    if (action.kind === 'approve') {
      setApproveError(null)
      setApproveOpen(true)
    } else if (action.confirm) {
      setPendingAction(action)
    } else if (action.to) {
      await persist({ status: action.to })
    }
  }

  async function handleConfirmedAction() {
    const action = pendingAction
    if (!action?.to) return
    await persist({ status: action.to })
    setPendingAction(null)
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
          <PurchaseStatusBadge status={request.status} />
        </div>
        {actions.map((action) => (
          <Button
            key={action.id}
            size="sm"
            variant={action.tone === 'primary' ? 'primary' : action.tone}
            disabled={saving || approving}
            onClick={() => handleAction(action)}
          >
            {action.kind === 'approve' && <BadgeCheck size={13} />} {action.label}
          </Button>
        ))}
        {canDownload && (
          <Button size="sm" variant="secondary" disabled={downloading} onClick={handleDownloadClick}>
            <FileSpreadsheet size={13} /> {downloading ? 'Preparing…' : 'Download Purchase Sheet'}
          </Button>
        )}
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
            <p>The purchase sheet (.xlsx) will download automatically once it is approved.</p>
          </div>
          {approveError && <p className="text-rose-400">{approveError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={approving} onClick={() => setApproveOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={approving} onClick={handleApprove}>
              {approving ? 'Approving…' : 'Approve & Download Sheet'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        onConfirm={handleConfirmedAction}
        title={pendingAction?.confirm?.title ?? ''}
        confirmLabel={pendingAction?.confirm?.confirmLabel}
        busyLabel={pendingAction?.confirm?.busyLabel}
        busy={saving}
        description={<p>{pendingAction?.confirm?.body}</p>}
      />

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

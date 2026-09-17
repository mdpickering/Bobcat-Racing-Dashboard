'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Pencil, Check, X } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Badge from '@/components/ui/Badge'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import PurchaseStatusBadge, { ALL_PURCHASE_STATUSES } from './PurchaseStatusBadge'
import { createClient } from '@/lib/supabase/client'
import { updatePurchaseRequest } from '@/lib/supabase/queries/purchasing'
import { formatDate } from '@/lib/format'
import type { PurchaseRequest, PurchaseStatus } from '@/types/database'

interface PurchaseRequestDetailHeaderProps {
  request: PurchaseRequest
  canManage: boolean
  canApprove: boolean
}

export default function PurchaseRequestDetailHeader({ request, canManage, canApprove }: PurchaseRequestDetailHeaderProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(request.title)
  const [description, setDescription] = useState(request.description ?? '')
  const [vendor, setVendor] = useState(request.vendor ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A lead can manage a request but only CTO/Admin can approve or reject it
  // (enforced as a hard DB error, not a silent revert) — the status options
  // shown reflect that so a lead never hits a permission error mid-select.
  // The request's current status is always included even if it's outside
  // that set (e.g. a lead viewing an already-Approved request) — otherwise
  // a <select> whose value isn't among its options silently falls back to
  // displaying the first option, making the dropdown lie about the actual
  // status.
  const selectableStatuses = canApprove
    ? ALL_PURCHASE_STATUSES
    : ALL_PURCHASE_STATUSES.filter((s) => (s !== 'Approved' && s !== 'Rejected') || s === request.status)

  async function persist(patch: Record<string, unknown>) {
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      await updatePurchaseRequest(supabase, request.id, patch)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(status: string) {
    await persist({ status: status as PurchaseStatus })
  }

  async function handleSaveDetails() {
    await persist({ title, description: description || null, vendor: vendor || null })
    setEditing(false)
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
      </div>
    </Panel>
  )
}

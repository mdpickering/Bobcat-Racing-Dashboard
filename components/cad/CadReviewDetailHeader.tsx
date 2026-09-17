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
import CadStatusBadge, { ALL_CAD_STATUSES } from './CadStatusBadge'
import { createClient } from '@/lib/supabase/client'
import { updateCadReview } from '@/lib/supabase/queries/cad'
import { formatDate } from '@/lib/format'
import type { CadReview, CadReviewStatus } from '@/types/database'

interface CadReviewDetailHeaderProps {
  review: CadReview
  canEditDetails: boolean
  canManage: boolean
  canApproveManufacturing: boolean
  isSubmitter: boolean
}

export default function CadReviewDetailHeader({ review, canEditDetails, canManage, canApproveManufacturing, isSubmitter }: CadReviewDetailHeaderProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(review.title)
  const [description, setDescription] = useState(review.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A plain submitter (not the subsystem's lead, not cto/admin) may only
  // leave a review at Draft or move it to Submitted for Review — anything
  // else is silently reverted by the DB trigger. A lead/cto/admin may make
  // review decisions, but only cto/admin may set Approved for Manufacturing
  // (a hard DB error for anyone else) — see cad_reviews_before_write. The
  // review's current status is always included even outside that set (e.g.
  // a submitter viewing a review a lead moved to Changes Requested) —
  // otherwise a <select> whose value isn't among its options silently
  // falls back to displaying the first option, misrepresenting the actual
  // status.
  const canEditStatus = canManage || isSubmitter
  const restrictedOptions: CadReviewStatus[] = canManage
    ? ALL_CAD_STATUSES.filter((s) => s !== 'Approved for Manufacturing')
    : ['Draft', 'Submitted for Review']
  const statusOptions: CadReviewStatus[] = canApproveManufacturing
    ? ALL_CAD_STATUSES
    : restrictedOptions.includes(review.status)
      ? restrictedOptions
      : [...restrictedOptions, review.status]

  async function persist(patch: Record<string, unknown>) {
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      await updateCadReview(supabase, review.id, patch)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(status: string) {
    await persist({ status: status as CadReviewStatus })
  }

  async function handleSaveDetails() {
    await persist({ title, description: description || null })
    setEditing(false)
  }

  return (
    <Panel className="p-5">
      <Link href="/cad" className="mb-3 flex items-center gap-1 text-[11px] text-text-muted hover:text-accent-blue">
        <ChevronLeft size={13} /> Back to CAD review
      </Link>

      {error && <p className="mb-2 text-xs text-rose-400">{error}</p>}

      {editing ? (
        <div className="space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-sm font-bold" />
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
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
            <h1 className="text-base font-bold text-text-primary">{review.title}</h1>
            {canEditDetails && (
              <button type="button" onClick={() => setEditing(true)} className="flex-shrink-0 text-text-muted hover:text-accent-blue">
                <Pencil size={14} />
              </button>
            )}
          </div>
          {review.description && <p className="mt-2 whitespace-pre-wrap text-xs text-text-secondary">{review.description}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px]">
            <Badge tone="slate">{review.subsystem?.name ?? 'Unknown subsystem'}</Badge>
            <Badge tone="slate">Rev {review.current_revision}</Badge>
            {review.task?.title && <Badge tone="slate">{review.task.title}</Badge>}
            <span className="text-text-muted">
              Submitted by {review.submitter?.display_name || review.submitter?.email} · {formatDate(review.created_at)}
            </span>
            {review.reviewer && (
              <span className="text-text-muted">
                · Reviewed by {review.reviewer.display_name || review.reviewer.email}
                {review.reviewed_at ? ` (${formatDate(review.reviewed_at)})` : ''}
              </span>
            )}
          </div>
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Status</label>
          {canEditStatus ? (
            <Select value={review.status} disabled={saving} onChange={(e) => handleStatusChange(e.target.value)} className="w-52">
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          ) : (
            <CadStatusBadge status={review.status} />
          )}
        </div>
      </div>
    </Panel>
  )
}

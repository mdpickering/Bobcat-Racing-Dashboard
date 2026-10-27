'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, ExternalLink, Info, Pencil, RotateCcw, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import Panel from '@/components/ui/Panel'
import StatusBadge from '@/components/ui/StatusBadge'
import { createClient } from '@/lib/supabase/client'
import { updateBomLine, type BomReviewPatch } from '@/lib/supabase/queries/bom'
import { KIND_LABEL, KIND_TONE, RECORD_TYPES, flagSeverity, formatOrderDate, kindOf, safeHttpUrl, type BomLine } from '@/lib/bom'
import { formatUsd } from '@/lib/parts'
import { formatDateTime } from '@/lib/format'

interface BomReviewCardProps {
  line: BomLine
  subsystems: string[]
  seasons: string[]
  vendors: string[]
}

// One flagged line, with what the spreadsheet said was wrong and the three ways to deal with it: "Looks right" (checked
// as it stands), "Save changes" (correct it, then checked) or "Ignore" (the question does not matter). Every action is
// one database update; the database records who did it and when, and the list refreshes so the line leaves the queue.
export default function BomReviewCard({ line, subsystems, seasons, vendors }: BomReviewCardProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState(line.review_note ?? '')
  const [subsystem, setSubsystem] = useState(line.subsystem)
  const [season, setSeason] = useState(line.season)
  const [recordType, setRecordType] = useState(line.record_type)
  const [vendor, setVendor] = useState(line.vendor ?? '')
  const [partNumber, setPartNumber] = useState(line.part_number ?? '')

  const id = line.id
  const kind = kindOf(line)
  const severity = flagSeverity(line.review_flag)
  const done = line.review_status !== 'open'
  const link = safeHttpUrl(line.link)

  async function run(patch: BomReviewPatch) {
    setBusy(true)
    setError(null)
    try {
      await updateBomLine(createClient(), line.id, patch)
      setEditing(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this line.')
    } finally {
      setBusy(false)
    }
  }

  const noteValue = note.trim() === '' ? null : note.trim()

  function saveChanges() {
    const patch: BomReviewPatch = { review_status: 'checked', review_note: noteValue }
    if (subsystem !== line.subsystem) patch.subsystem = subsystem
    if (season !== line.season) patch.season = season
    if (recordType !== line.record_type) patch.record_type = recordType
    if (vendor.trim() !== (line.vendor ?? '')) patch.vendor = vendor.trim() || null
    if (partNumber.trim() !== (line.part_number ?? '')) patch.part_number = partNumber.trim() || null
    void run(patch)
  }

  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-medium text-text-primary">
            {line.item}
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer" className="touch-target -my-3.5 -mr-4 ml-[-10px] inline-flex items-center justify-center px-4 align-middle text-accent-blue hover:underline" title="Open the product page">
                <ExternalLink size={12} aria-hidden="true" />
                <span className="sr-only">Open the product page for {line.item} (new tab)</span>
              </a>
            )}
          </h3>
          <p className="mt-0.5 text-2xs text-text-muted">
            {[line.part_number, line.vendor, line.season, line.subsystem + (line.sub_assembly ? ` / ${line.sub_assembly}` : '')].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <StatusBadge tone={KIND_TONE[kind]}>{KIND_LABEL[kind]}</StatusBadge>
          {line.total_cost !== null && <span className="font-mono text-xs tabular-nums text-text-primary">{formatUsd(line.total_cost)}</span>}
        </div>
      </div>

      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-2xs text-text-muted">
        {line.quantity !== null && (
          <div className="flex gap-1">
            <dt>Qty</dt>
            <dd className="text-text-secondary">{line.quantity}</dd>
          </div>
        )}
        {line.ordered_on && (
          <div className="flex gap-1">
            <dt>Date</dt>
            <dd className="text-text-secondary">{formatOrderDate(line.ordered_on)}</dd>
          </div>
        )}
        {line.members && (
          <div className="flex gap-1">
            <dt>Who</dt>
            <dd className="text-text-secondary">{line.members}</dd>
          </div>
        )}
        {line.source_files && (
          <div className="flex gap-1">
            <dt>From</dt>
            <dd className="break-all text-text-secondary">{line.source_files}</dd>
          </div>
        )}
      </dl>
      {line.notes && <p className="mt-1 text-2xs text-text-muted">{line.notes}</p>}

      {line.review_flag && (
        <div className={`mt-3 flex items-start gap-1.5 rounded-xl px-3 py-2 text-xs leading-5 ${severity === 'check' ? 'bg-status-warning/10 text-status-warning' : 'bg-surface-raised/60 text-text-secondary'}`}>
          {severity === 'check' ? <AlertTriangle size={13} className="mt-1 flex-shrink-0" aria-hidden="true" /> : <Info size={13} className="mt-1 flex-shrink-0" aria-hidden="true" />}
          <span>{line.review_flag}</span>
        </div>
      )}

      {done ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-text-secondary">
            <span className="font-semibold text-text-primary">{line.review_status === 'checked' ? 'Checked' : 'Ignored'}</span>
            {line.reviewed_at ? ` on ${formatDateTime(line.reviewed_at)}` : ''}
            {line.review_note ? ` — ${line.review_note}` : ''}
          </p>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => run({ review_status: 'open' })}>
            <RotateCcw size={12} aria-hidden="true" /> {busy ? 'Reopening…' : 'Reopen'}
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {editing && (
            <div className="grid gap-3 rounded-xl border border-border bg-bg/40 p-3 sm:grid-cols-2">
              <div>
                <label htmlFor={`sub-${id}`} className="mb-1 block text-2xs font-medium text-text-muted">
                  Subsystem
                </label>
                <Select id={`sub-${id}`} value={subsystem} onChange={(e) => setSubsystem(e.target.value)}>
                  {subsystems.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label htmlFor={`season-${id}`} className="mb-1 block text-2xs font-medium text-text-muted">
                  Season
                </label>
                <Select id={`season-${id}`} value={season} onChange={(e) => setSeason(e.target.value)}>
                  {seasons.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label htmlFor={`type-${id}`} className="mb-1 block text-2xs font-medium text-text-muted">
                  Type
                </label>
                <Select id={`type-${id}`} value={recordType} onChange={(e) => setRecordType(e.target.value as BomLine['record_type'])}>
                  {RECORD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label htmlFor={`vendor-${id}`} className="mb-1 block text-2xs font-medium text-text-muted">
                  Vendor
                </label>
                <Input id={`vendor-${id}`} list={`vendors-${id}`} value={vendor} maxLength={150} onChange={(e) => setVendor(e.target.value)} />
                <datalist id={`vendors-${id}`}>
                  {vendors.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor={`pn-${id}`} className="mb-1 block text-2xs font-medium text-text-muted">
                  Part number
                </label>
                <Input id={`pn-${id}`} value={partNumber} maxLength={100} className="font-mono" onChange={(e) => setPartNumber(e.target.value)} />
              </div>
            </div>
          )}

          <div>
            <label htmlFor={`note-${id}`} className="mb-1 block text-2xs font-medium text-text-muted">
              Note (optional)
            </label>
            <Textarea id={`note-${id}`} rows={2} maxLength={1000} value={note} placeholder="What you found, e.g. “Ordered from Metals Depot, confirmed with Carter.”" onChange={(e) => setNote(e.target.value)} />
          </div>

          {error && (
            <p role="alert" className="text-xs text-status-danger">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <>
                <Button size="sm" disabled={busy} onClick={saveChanges}>
                  <Check size={12} aria-hidden="true" /> {busy ? 'Saving…' : 'Save changes'}
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" disabled={busy} onClick={() => run({ review_status: 'checked', review_note: noteValue })}>
                  <Check size={12} aria-hidden="true" /> {busy ? 'Saving…' : 'Looks right'}
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => setEditing(true)}>
                  <Pencil size={12} aria-hidden="true" /> Correct details
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ review_status: 'ignored', review_note: noteValue })}>
                  <X size={12} aria-hidden="true" /> Ignore
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Panel>
  )
}

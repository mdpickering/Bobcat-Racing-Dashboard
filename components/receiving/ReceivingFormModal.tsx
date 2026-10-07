'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import Badge from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { CatalogPartPicker, type PickedPart } from '@/components/purchasing/CatalogPickers'
import { createClient } from '@/lib/supabase/client'
import { listActiveLocations, listReceivingStatusForRequest, receivePurchaseItems, type ReceiveLineInput } from '@/lib/supabase/queries/inventory'
import { getErrorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import type { PurchaseReceivingStatusRow } from '@/types/database'

interface LineState {
  received: string
  rejected: string
  rejectedReason: string
  chosenPart: PickedPart | null
  locationId: string
}

const today = () => new Date().toISOString().slice(0, 10)
const emptyLine = (defaultLocation: string): LineState => ({ received: '', rejected: '', rejectedReason: '', chosenPart: null, locationId: defaultLocation })

interface ReceivingFormModalProps {
  open: boolean
  onClose: () => void
  purchaseRequestId: string
  requestTitle: string
  onReceived?: () => void
}

// Receives against ONE purchase request in one call to receive_purchase_items() (migration 0038). The database is
// the only real enforcement (accepted + already-received can never exceed ordered, a rejection always needs a
// reason, a location is required exactly when stock would be created) — this form gives the same rules
// immediately, but a rejected attempt here changes nothing, exactly like the database itself.
export default function ReceivingFormModal({ open, onClose, purchaseRequestId, requestTitle, onReceived }: ReceivingFormModalProps) {
  const router = useRouter()
  const toast = useToast()
  // Generated once, when the form opens (this component is only mounted while open) — the SAME token is reused
  // for every retry within this submission, so a double click or a retry after a network error can never receive
  // the same units twice.
  const [clientToken] = useState(() => crypto.randomUUID())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rows, setRows] = useState<PurchaseReceivingStatusRow[]>([])
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
  const [receivedOn, setReceivedOn] = useState(today())
  const [notes, setNotes] = useState('')
  const [lineState, setLineState] = useState<Record<string, LineState>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const supabase = createClient()
        const [lines, locs] = await Promise.all([listReceivingStatusForRequest(supabase, purchaseRequestId), listActiveLocations(supabase)])
        if (cancelled) return
        setRows(lines)
        setLocations(locs)
        const defaultLoc = locs[0]?.id ?? ''
        setLineState(Object.fromEntries(lines.filter((l) => l.outstanding_quantity > 0).map((l) => [l.item_id, emptyLine(defaultLoc)])))
      } catch (err) {
        if (!cancelled) setLoadError(getErrorMessage(err, 'Could not load this request.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [purchaseRequestId])

  const outstanding = rows.filter((r) => r.outstanding_quantity > 0)
  const already = rows.filter((r) => r.outstanding_quantity === 0)

  function setLine(itemId: string, patch: Partial<LineState>) {
    setLineState((s) => ({ ...s, [itemId]: { ...s[itemId], ...patch } }))
  }

  // Per-line validation, mirroring the database exactly: accepted <= outstanding, rejected needs a reason, a
  // location is required only when accepted units would actually create stock (a catalog-linked line, or a
  // free-text line where a catalog part was chosen here).
  const lineErrors = useMemo(() => {
    const errs: Record<string, string> = {}
    for (const row of outstanding) {
      const s = lineState[row.item_id]
      if (!s) continue
      const received = s.received.trim() === '' ? 0 : Number(s.received)
      const rejected = s.rejected.trim() === '' ? 0 : Number(s.rejected)
      if (!Number.isInteger(received) || received < 0) { errs[row.item_id] = 'Enter a whole number 0 or more.'; continue }
      if (!Number.isInteger(rejected) || rejected < 0) { errs[row.item_id] = 'Enter a whole number 0 or more.'; continue }
      if (received > row.outstanding_quantity) { errs[row.item_id] = `Only ${row.outstanding_quantity} still outstanding.`; continue }
      if (rejected > 0 && s.rejectedReason.trim() === '') { errs[row.item_id] = 'Say why the rejected units were rejected.'; continue }
      const effectivePartId = row.part_id ?? s.chosenPart?.id ?? null
      if (received > 0 && effectivePartId && !s.locationId) { errs[row.item_id] = 'Choose where this is being stored.'; continue }
    }
    return errs
  }, [outstanding, lineState])

  const touchedCount = outstanding.filter((r) => {
    const s = lineState[r.item_id]
    return s && ((s.received.trim() !== '' && Number(s.received) > 0) || (s.rejected.trim() !== '' && Number(s.rejected) > 0))
  }).length

  const valid = !loading && outstanding.length > 0 && touchedCount > 0 && Object.keys(lineErrors).length === 0 && receivedOn !== '' && receivedOn <= today()

  function close() {
    if (busy) return
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      const lines: ReceiveLineInput[] = outstanding
        .map((row): ReceiveLineInput | null => {
          const s = lineState[row.item_id]
          const received = Number(s.received.trim() || '0')
          const rejected = Number(s.rejected.trim() || '0')
          if (received === 0 && rejected === 0) return null
          const effectivePartId = row.part_id ?? s.chosenPart?.id ?? null
          return {
            item_id: row.item_id,
            received,
            rejected,
            rejected_reason: rejected > 0 ? s.rejectedReason.trim() : null,
            part_id: row.part_id ? null : s.chosenPart?.id ?? null, // only send a NEW part choice for a free-text line; a catalog-linked line already has one
            location_id: received > 0 && effectivePartId ? s.locationId : null,
            notes: null,
          }
        })
        .filter((l): l is ReceiveLineInput => l !== null)

      await receivePurchaseItems(createClient(), { purchase_request_id: purchaseRequestId, received_on: receivedOn, notes: notes.trim() || null, client_token: clientToken, lines })
      toast.push(`Received against "${requestTitle}".`, 'success')
      onReceived?.()
      onClose()
      router.refresh()
    } catch (err) {
      // The database's message is already plain language (over-receiving, missing reason, missing location,
      // wrong status) — never a raw Postgres error. The client_token is unchanged, so retrying resubmits safely.
      setError(getErrorMessage(err, 'Could not record this receipt.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title={`Receive: ${requestTitle}`} maxWidthClassName="max-w-2xl">
      {loading ? (
        <p className="text-xs text-text-muted">Loading…</p>
      ) : loadError ? (
        <p className="text-xs text-status-danger">{loadError}</p>
      ) : outstanding.length === 0 ? (
        <p className="text-xs text-text-muted">Every line on this request has already been fully received.</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-text-secondary">Received on</label>
              <Input type="date" value={receivedOn} max={today()} onChange={(e) => setReceivedOn(e.target.value)} disabled={busy} />
            </div>
          </div>

          <div className="space-y-3">
            {outstanding.map((row) => {
              const s = lineState[row.item_id]
              if (!s) return null
              const err = lineErrors[row.item_id]
              const needsLocation = (row.part_id ?? s.chosenPart?.id) && Number(s.received.trim() || '0') > 0
              return (
                <div key={row.item_id} className="rounded-lg border border-border p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-text-primary">{row.description}</div>
                      <div className="text-2xs text-text-muted">
                        {row.part_number && <span className="font-mono">{row.part_number}</span>}
                        {row.vendor && <span> · {row.vendor}</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-2xs">
                      <Badge tone="neutral">Ordered {row.ordered_quantity}</Badge>
                      <Badge tone="info">Accepted {row.accepted_quantity}</Badge>
                      <Badge tone="warning">Outstanding {row.outstanding_quantity}</Badge>
                    </div>
                  </div>

                  {!row.part_id && (
                    <div className="mb-2">
                      <CatalogPartPicker selected={s.chosenPart} onChange={(p) => setLine(row.item_id, { chosenPart: p })} disabled={busy} />
                      <p className="mt-1 text-2xs text-text-muted">This line has no catalog part. Optional: pick one to track it as stock. Leave blank to just record it as received.</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <label className="mb-1 block text-text-secondary">Accepted</label>
                      <Input type="number" min={0} max={row.outstanding_quantity} step={1} value={s.received} onChange={(e) => setLine(row.item_id, { received: e.target.value })} disabled={busy} placeholder="0" />
                    </div>
                    <div>
                      <label className="mb-1 block text-text-secondary">Rejected</label>
                      <Input type="number" min={0} step={1} value={s.rejected} onChange={(e) => setLine(row.item_id, { rejected: e.target.value })} disabled={busy} placeholder="0" />
                    </div>
                    {Number(s.rejected.trim() || '0') > 0 && (
                      <div className="col-span-2">
                        <label className="mb-1 block text-text-secondary">Rejection reason</label>
                        <Input value={s.rejectedReason} onChange={(e) => setLine(row.item_id, { rejectedReason: e.target.value })} disabled={busy} placeholder="e.g. Damaged in shipping" />
                      </div>
                    )}
                    {needsLocation && (
                      <div className="col-span-2">
                        <label className="mb-1 block text-text-secondary">Location</label>
                        {locations.length === 0 ? (
                          <p className="text-2xs text-status-warning">No locations exist yet — an Admin, CTO or the COO adds one from the Inventory page.</p>
                        ) : (
                          <Select value={s.locationId} onChange={(e) => setLine(row.item_id, { locationId: e.target.value })} disabled={busy}>
                            {locations.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.name}
                              </option>
                            ))}
                          </Select>
                        )}
                      </div>
                    )}
                  </div>
                  {err && <p className="mt-1.5 text-2xs text-status-danger">{err}</p>}
                </div>
              )
            })}
          </div>

          {already.length > 0 && (
            <div>
              <p className="mb-1 text-2xs font-medium text-text-muted">Already fully received</p>
              <ul className="text-2xs text-text-muted">
                {already.map((row) => (
                  <li key={row.item_id}>
                    {row.description} — {row.accepted_quantity} of {row.ordered_quantity}
                    {row.last_received_on && <span> ({formatDate(row.last_received_on)})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label className="mb-1 block text-text-secondary">Notes (this receipt)</label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy} placeholder="Optional" />
          </div>

          {error && <p className="text-status-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !valid}>
              {busy ? 'Receiving…' : 'Receive'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

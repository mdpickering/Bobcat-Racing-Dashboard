'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import { createClient } from '@/lib/supabase/client'
import { adjustInventory, recordOpeningBalance, transferInventory, writeOffInventory } from '@/lib/supabase/queries/inventory'
import { parseQuantity, validateReason } from '@/lib/inventory'
import { getErrorMessage } from '@/lib/errors'

export type StockActionMode = 'adjust' | 'write_off' | 'transfer' | 'opening_balance'

const TITLE: Record<StockActionMode, string> = {
  adjust: 'Adjust stock',
  write_off: 'Write off stock',
  transfer: 'Transfer stock',
  opening_balance: 'Record opening balance',
}

const LABEL = 'mb-1 block text-xs text-text-secondary'

interface StockActionModalProps {
  open: boolean
  onClose: () => void
  mode: StockActionMode
  partId: string
  partLabel: string
  locations: { id: string; name: string }[]
  // current on-hand per active location, so the form can show "N on hand here" before submitting
  stockByLocation: { location_id: string; quantity_on_hand: number }[]
}

// One modal, four modes — they share the same shape (a part, one or two locations, a quantity, a reason) and the
// same rule: the database (adjust_inventory / write_off_inventory / transfer_inventory / record_opening_balance,
// migration 0038) is the only real enforcement (stock can never go negative, a reason is always required except
// for a plain receipt/transfer). This form only gives friendly, immediate feedback first.
export default function StockActionModal({ open, onClose, mode, partId, partLabel, locations, stockByLocation }: StockActionModalProps) {
  const router = useRouter()
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '')
  const [fromLocationId, setFromLocationId] = useState(locations[0]?.id ?? '')
  const [toLocationId, setToLocationId] = useState(locations[1]?.id ?? locations[0]?.id ?? '')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onHandAt = (id: string) => stockByLocation.find((s) => s.location_id === id)?.quantity_on_hand ?? 0
  const qtyCheck = parseQuantity(quantity, { allowNegative: mode === 'adjust' })
  const reasonError = mode === 'transfer' ? null : validateReason(reason)
  const sameLocation = mode === 'transfer' && fromLocationId !== '' && fromLocationId === toLocationId
  const hasLocations = locations.length > 0
  const valid = hasLocations && qtyCheck.error === null && reasonError === null && !sameLocation && (mode !== 'transfer' ? locationId !== '' : fromLocationId !== '' && toLocationId !== '')

  function reset() {
    setQuantity('')
    setReason('')
    setNotes('')
    setError(null)
  }
  function close() {
    if (busy) return
    reset()
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || busy || qtyCheck.value === null) return
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      if (mode === 'adjust') {
        await adjustInventory(supabase, { part_id: partId, location_id: locationId, delta: qtyCheck.value, reason: reason.trim(), notes: notes.trim() || null })
      } else if (mode === 'write_off') {
        await writeOffInventory(supabase, { part_id: partId, location_id: locationId, quantity: qtyCheck.value, reason: reason.trim(), notes: notes.trim() || null })
      } else if (mode === 'opening_balance') {
        await recordOpeningBalance(supabase, { part_id: partId, location_id: locationId, quantity: qtyCheck.value, reason: reason.trim(), notes: notes.trim() || null })
      } else {
        await transferInventory(supabase, { part_id: partId, from_location_id: fromLocationId, to_location_id: toLocationId, quantity: qtyCheck.value, notes: notes.trim() || null })
      }
      close()
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save this change.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title={TITLE[mode]} maxWidthClassName="max-w-sm">
      <form onSubmit={handleSubmit} className="space-y-3 text-xs">
        <p className="text-text-secondary">
          <span className="font-semibold text-text-primary">{partLabel}</span>
        </p>

        {!hasLocations ? (
          <p className="rounded-lg border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-status-warning">
            No locations exist yet. An Admin, CTO or the COO adds the team&apos;s locations from the Inventory page before stock can be recorded.
          </p>
        ) : mode === 'transfer' ? (
          <>
            <div>
              <label className={LABEL}>From location</label>
              <Select value={fromLocationId} onChange={(e) => setFromLocationId(e.target.value)} disabled={busy}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} — {onHandAt(l.id)} on hand
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className={LABEL}>To location</label>
              <Select value={toLocationId} onChange={(e) => setToLocationId(e.target.value)} disabled={busy}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} — {onHandAt(l.id)} on hand
                  </option>
                ))}
              </Select>
              {sameLocation && <p className="mt-1 text-2xs text-status-danger">Choose two different locations.</p>}
            </div>
          </>
        ) : (
          <div>
            <label className={LABEL}>Location</label>
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={busy}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} — {onHandAt(l.id)} on hand
                </option>
              ))}
            </Select>
          </div>
        )}

        <div>
          <label className={LABEL}>{mode === 'adjust' ? 'Change (+ to add, − to remove)' : 'Quantity'}</label>
          <Input type="number" step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} disabled={busy || !hasLocations} placeholder={mode === 'adjust' ? 'e.g. -2 or 5' : 'e.g. 5'} aria-invalid={qtyCheck.error !== null} />
          {qtyCheck.error && <p className="mt-1 text-2xs text-status-danger">{qtyCheck.error}</p>}
        </div>

        {mode !== 'transfer' && (
          <div>
            <label className={LABEL}>
              Reason <span className="text-status-danger">*</span>
            </label>
            <Input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} disabled={busy || !hasLocations} placeholder={mode === 'opening_balance' ? 'e.g. Physical count at season start' : mode === 'write_off' ? 'e.g. Damaged, no longer usable' : 'e.g. Found extra in a drawer'} />
          </div>
        )}

        <div>
          <label className={LABEL}>Notes</label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy || !hasLocations} placeholder="Optional" />
        </div>

        {mode === 'opening_balance' && <p className="text-2xs text-text-muted">This records stock the team already physically has — it does not create a purchase.</p>}
        {mode === 'write_off' && <p className="text-2xs text-text-muted">A write-off permanently removes this quantity and stays in the ledger; it cannot be edited or deleted later.</p>}

        {error && <p className="text-status-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button type="submit" variant={mode === 'write_off' ? 'danger' : 'primary'} disabled={busy || !valid}>
            {busy ? 'Saving…' : TITLE[mode]}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

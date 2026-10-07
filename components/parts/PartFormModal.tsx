'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import { createClient } from '@/lib/supabase/client'
import { createPart, updatePart } from '@/lib/supabase/queries/parts'
import { getErrorMessage } from '@/lib/errors'
import { parseOptionalCost, validateOptionalUrl } from '@/lib/parts'
import type { PartCatalogRow } from '@/types/database'

interface PartFormModalProps {
  open: boolean
  onClose: () => void
  // null = create
  part: PartCatalogRow | null
  // the subsystems this person may create parts in (all of them for cto/admin, the ones they lead otherwise)
  subsystemOptions: { id: string; name: string }[]
  // moving an existing part to another subsystem is cto/admin only (the database refuses it for anyone else)
  canMoveSubsystem: boolean
}

const LABEL = 'mb-1 block text-xs text-text-secondary'

// Create / edit a part. Everything is validated by the database as well (unique part number, http(s)-only links,
// non-negative cost, subsystem rules); this form gives the friendly version of the same messages first.
export default function PartFormModal({ open, onClose, part, subsystemOptions, canMoveSubsystem }: PartFormModalProps) {
  const router = useRouter()
  const editing = part !== null
  const [partNumber, setPartNumber] = useState(part?.part_number ?? '')
  const [name, setName] = useState(part?.name ?? '')
  const [subsystemId, setSubsystemId] = useState(part?.subsystem_id ?? subsystemOptions[0]?.id ?? '')
  const [category, setCategory] = useState(part?.category ?? '')
  const [manufacturer, setManufacturer] = useState(part?.manufacturer ?? '')
  const [mpn, setMpn] = useState(part?.manufacturer_part_number ?? '')
  const [cost, setCost] = useState(part?.unit_cost != null ? String(part.unit_cost) : '')
  const [sourceUrl, setSourceUrl] = useState(part?.source_url ?? '')
  const [description, setDescription] = useState(part?.description ?? '')
  const [notes, setNotes] = useState(part?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const costCheck = parseOptionalCost(cost)
  const urlError = validateOptionalUrl(sourceUrl)
  const valid = partNumber.trim() !== '' && name.trim() !== '' && subsystemId !== '' && costCheck.error === null && urlError === null

  // an existing part keeps its current subsystem in the list even if this person could not pick it for a NEW part
  const options = part && !subsystemOptions.some((s) => s.id === part.subsystem_id) ? [...subsystemOptions, { id: part.subsystem_id, name: part.subsystem_name }] : subsystemOptions

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      const values = {
        part_number: partNumber.trim(),
        name: name.trim(),
        description: description.trim() || null,
        subsystem_id: subsystemId,
        category: category.trim() || null,
        manufacturer: manufacturer.trim() || null,
        manufacturer_part_number: mpn.trim() || null,
        unit_cost: costCheck.value,
        source_url: sourceUrl.trim() || null,
        notes: notes.trim() || null,
      }
      if (editing && part) {
        await updatePart(supabase, part.id, { ...values, ...(canMoveSubsystem || subsystemId === part.subsystem_id ? {} : { subsystem_id: part.subsystem_id }) })
        onClose()
        router.refresh()
      } else {
        const id = await createPart(supabase, values)
        onClose()
        router.push(`/parts/${id}`)
        router.refresh()
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save the part.'))
    } finally {
      setBusy(false)
    }
  }

  async function setActive(active: boolean) {
    if (!part) return
    setBusy(true)
    setError(null)
    try {
      await updatePart(createClient(), part.id, { active })
      onClose()
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not change the status.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={editing ? 'Edit part' : 'Add a part'} maxWidthClassName="max-w-xl">
      <form onSubmit={handleSubmit} noValidate className="space-y-3 text-xs">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="part-number" className={LABEL}>
              Part number <span className="text-status-danger">*</span>
            </label>
            <Input id="part-number" value={partNumber} maxLength={60} onChange={(e) => setPartNumber(e.target.value)} disabled={busy} placeholder="e.g. FS-0012" autoFocus={!editing} />
            <p className="mt-1 text-2xs text-text-muted">The team&apos;s own number. Unique; letter case and spaces are ignored.</p>
          </div>
          <div>
            <label htmlFor="part-name" className={LABEL}>
              Name <span className="text-status-danger">*</span>
            </label>
            <Input id="part-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} disabled={busy} placeholder="e.g. Upper control arm" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="part-subsystem" className={LABEL}>
              Subsystem <span className="text-status-danger">*</span>
            </label>
            <Select id="part-subsystem" value={subsystemId} onChange={(e) => setSubsystemId(e.target.value)} disabled={busy || (editing && !canMoveSubsystem)}>
              {options.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            {editing && !canMoveSubsystem && <p className="mt-1 text-2xs text-text-muted">Only the CTO or an admin can move a part to another subsystem.</p>}
          </div>
          <div>
            <label htmlFor="part-category" className={LABEL}>Category</label>
            <Input id="part-category" value={category} maxLength={100} onChange={(e) => setCategory(e.target.value)} disabled={busy} placeholder="e.g. Fasteners (optional)" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="part-mfr" className={LABEL}>Manufacturer</label>
            <Input id="part-mfr" value={manufacturer} maxLength={150} onChange={(e) => setManufacturer(e.target.value)} disabled={busy} />
          </div>
          <div>
            <label htmlFor="part-mpn" className={LABEL}>Manufacturer part number</label>
            <Input id="part-mpn" value={mpn} maxLength={100} onChange={(e) => setMpn(e.target.value)} disabled={busy} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="part-cost" className={LABEL}>Reference unit cost ($)</label>
            <Input id="part-cost" type="number" min={0} step="0.01" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} disabled={busy} placeholder="Optional" aria-invalid={costCheck.error !== null} />
            {costCheck.error ? <p className="mt-1 text-2xs text-status-danger">{costCheck.error}</p> : <p className="mt-1 text-2xs text-text-muted">A vendor&apos;s own price is set on the vendor link.</p>}
          </div>
          <div>
            <label htmlFor="part-source" className={LABEL}>Source link</label>
            <Input id="part-source" type="url" inputMode="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} disabled={busy} placeholder="https://… (optional)" aria-invalid={urlError !== null} className={urlError ? 'border-status-danger/60 focus:border-status-danger' : ''} />
            {urlError && <p className="mt-1 text-2xs text-status-danger">{urlError}</p>}
          </div>
        </div>
        <div>
          <label htmlFor="part-description" className={LABEL}>Description</label>
          <Textarea id="part-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} />
        </div>
        <div>
          <label htmlFor="part-notes" className={LABEL}>Notes</label>
          <Textarea id="part-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy} />
        </div>
        {error && <p className="text-status-danger">{error}</p>}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div>
            {editing && part && (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setActive(!part.active)}>
                {part.active ? 'Deactivate part' : 'Reactivate part'}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !valid}>
              {busy ? 'Saving…' : editing ? 'Save' : 'Add part'}
            </Button>
          </div>
        </div>
        {editing && part?.active && <p className="text-2xs text-text-muted">Deactivating keeps the part and its history. It disappears from the pickers but past purchases are untouched.</p>}
      </form>
    </Modal>
  )
}

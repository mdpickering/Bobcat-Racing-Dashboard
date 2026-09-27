'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import { createClient } from '@/lib/supabase/client'
import { createVendor, updateVendor } from '@/lib/supabase/queries/vendors'
import { getErrorMessage } from '@/lib/errors'
import { validateOptionalEmail, validateOptionalUrl } from '@/lib/parts'
import type { Vendor } from '@/types/database'

const LABEL = 'mb-1 block text-xs text-text-secondary'

// Create / edit / deactivate a vendor. Vendors are never deleted (deactivate keeps every past purchase and part link).
function VendorForm({ vendor, onClose }: { vendor: Vendor | null; onClose: () => void }) {
  const router = useRouter()
  const editing = vendor !== null
  const [name, setName] = useState(vendor?.name ?? '')
  const [website, setWebsite] = useState(vendor?.website ?? '')
  const [contactName, setContactName] = useState(vendor?.contact_name ?? '')
  const [contactEmail, setContactEmail] = useState(vendor?.contact_email ?? '')
  const [contactPhone, setContactPhone] = useState(vendor?.contact_phone ?? '')
  const [address, setAddress] = useState(vendor?.address ?? '')
  const [notes, setNotes] = useState(vendor?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const urlError = validateOptionalUrl(website)
  const emailError = validateOptionalEmail(contactEmail)
  const valid = name.trim() !== '' && urlError === null && emailError === null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    const values = {
      name: name.trim(),
      website: website.trim() || null,
      contact_name: contactName.trim() || null,
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
    }
    try {
      const supabase = createClient()
      if (editing && vendor) {
        await updateVendor(supabase, vendor.id, values)
        onClose()
        router.refresh()
      } else {
        const id = await createVendor(supabase, values)
        onClose()
        router.push(`/business/vendors/${id}`)
        router.refresh()
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save the vendor.'))
      setBusy(false)
    }
  }

  async function setActive(active: boolean) {
    if (!vendor) return
    setBusy(true)
    setError(null)
    try {
      await updateVendor(createClient(), vendor.id, { active })
      onClose()
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not change the status.'))
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={busy ? () => {} : onClose} title={editing ? 'Edit vendor' : 'Add a vendor'} maxWidthClassName="max-w-lg">
      <form onSubmit={submit} noValidate className="space-y-3 text-xs">
        <div>
          <label htmlFor="vendor-name" className={LABEL}>
            Vendor name <span className="text-status-danger">*</span>
          </label>
          <Input id="vendor-name" value={name} maxLength={150} onChange={(e) => setName(e.target.value)} disabled={busy} placeholder="e.g. McMaster-Carr" autoFocus={!editing} />
        </div>
        <div>
          <label htmlFor="vendor-website" className={LABEL}>Website</label>
          <Input id="vendor-website" type="url" inputMode="url" value={website} onChange={(e) => setWebsite(e.target.value)} disabled={busy} placeholder="https://… (optional)" aria-invalid={urlError !== null} className={urlError ? 'border-status-danger/60 focus:border-status-danger' : ''} />
          {urlError && <p className="mt-1 text-[11px] text-status-danger">{urlError}</p>}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="vendor-contact" className={LABEL}>Contact name</label>
            <Input id="vendor-contact" value={contactName} maxLength={150} onChange={(e) => setContactName(e.target.value)} disabled={busy} />
          </div>
          <div>
            <label htmlFor="vendor-phone" className={LABEL}>Contact phone</label>
            <Input id="vendor-phone" type="tel" value={contactPhone} maxLength={60} onChange={(e) => setContactPhone(e.target.value)} disabled={busy} />
          </div>
        </div>
        <div>
          <label htmlFor="vendor-email" className={LABEL}>Contact email</label>
          <Input id="vendor-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} disabled={busy} aria-invalid={emailError !== null} className={emailError ? 'border-status-danger/60 focus:border-status-danger' : ''} />
          {emailError && <p className="mt-1 text-[11px] text-status-danger">{emailError}</p>}
        </div>
        <div>
          <label htmlFor="vendor-address" className={LABEL}>Address</label>
          <Textarea id="vendor-address" rows={2} value={address} maxLength={500} onChange={(e) => setAddress(e.target.value)} disabled={busy} />
        </div>
        <div>
          <label htmlFor="vendor-notes" className={LABEL}>Notes</label>
          <Textarea id="vendor-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy} placeholder="Ordering rules, account numbers to ask about, shipping…" />
        </div>
        <p className="text-[11px] text-text-muted">Vendor contact details are visible to every signed-in team member so engineers can order.</p>
        {error && <p className="text-status-danger">{error}</p>}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div>
            {editing && vendor && (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setActive(!vendor.active)}>
                {vendor.active ? 'Deactivate vendor' : 'Reactivate vendor'}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !valid}>
              {busy ? 'Saving…' : editing ? 'Save' : 'Add vendor'}
            </Button>
          </div>
        </div>
        {editing && vendor?.active && <p className="text-[11px] text-text-muted">Deactivating keeps the vendor, its parts and every past purchase. It just stops appearing in the pickers.</p>}
      </form>
    </Modal>
  )
}

export function AddVendorButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={13} /> Add vendor
      </Button>
      {open && <VendorForm vendor={null} onClose={() => setOpen(false)} />}
    </>
  )
}

export function EditVendorButton({ vendor }: { vendor: Vendor }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Pencil size={13} /> Edit
      </Button>
      {open && <VendorForm key={vendor.updated_at} vendor={vendor} onClose={() => setOpen(false)} />}
    </>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ExternalLink, Plus, Star, Store } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { createClient } from '@/lib/supabase/client'
import { addPartVendor, removePartVendor, updatePartVendor, type PartVendorInput } from '@/lib/supabase/queries/parts'
import { getErrorMessage } from '@/lib/errors'
import { formatUsd, parseOptionalCost, validateOptionalUrl } from '@/lib/parts'
import { formatDate } from '@/lib/format'
import type { PartVendorLink } from '@/types/database'

interface PartVendorsPanelProps {
  partId: string
  links: PartVendorLink[]
  // active vendors that can still be linked (not already linked)
  availableVendors: { id: string; name: string }[]
  canManage: boolean
  // vendor pages live in the Business workspace; people who cannot open it see the name as text
  canOpenVendors: boolean
}

const LABEL = 'mb-1 block text-xs text-text-secondary'

function LinkForm({ mode, vendors, link, onClose, partId }: { mode: 'add' | 'edit'; vendors: { id: string; name: string }[]; link?: PartVendorLink; onClose: () => void; partId: string }) {
  const router = useRouter()
  const [vendorId, setVendorId] = useState(link?.vendor_id ?? vendors[0]?.id ?? '')
  const [vpn, setVpn] = useState(link?.vendor_part_number ?? '')
  const [cost, setCost] = useState(link?.unit_cost != null ? String(link.unit_cost) : '')
  const [url, setUrl] = useState(link?.product_url ?? '')
  const [preferred, setPreferred] = useState(link?.is_preferred ?? false)
  const [notes, setNotes] = useState(link?.availability_notes ?? '')
  const [verified, setVerified] = useState(link?.last_verified_on ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const costCheck = parseOptionalCost(cost)
  const urlError = validateOptionalUrl(url)
  const valid = vendorId !== '' && costCheck.error === null && urlError === null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    const input: PartVendorInput = {
      vendor_part_number: vpn.trim() || null,
      unit_cost: costCheck.value,
      product_url: url.trim() || null,
      is_preferred: preferred,
      availability_notes: notes.trim() || null,
      last_verified_on: verified || null,
    }
    try {
      const supabase = createClient()
      if (mode === 'add') await addPartVendor(supabase, partId, vendorId, input)
      else if (link) await updatePartVendor(supabase, partId, link.vendor_id, input)
      onClose()
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save the vendor details.'))
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={busy ? () => {} : onClose} title={mode === 'add' ? 'Link a vendor' : `Edit ${link?.vendor?.name ?? 'vendor'} details`} maxWidthClassName="max-w-lg">
      <form onSubmit={submit} noValidate className="space-y-3 text-xs">
        {mode === 'add' ? (
          <div>
            <label htmlFor="pv-vendor" className={LABEL}>Vendor</label>
            <Select id="pv-vendor" value={vendorId} onChange={(e) => setVendorId(e.target.value)} disabled={busy}>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="pv-vpn" className={LABEL}>Vendor part number</label>
            <Input id="pv-vpn" value={vpn} maxLength={100} onChange={(e) => setVpn(e.target.value)} disabled={busy} placeholder="The number to order" />
          </div>
          <div>
            <label htmlFor="pv-cost" className={LABEL}>Unit cost ($)</label>
            <Input id="pv-cost" type="number" min={0} step="0.01" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} disabled={busy} aria-invalid={costCheck.error !== null} />
            {costCheck.error && <p className="mt-1 text-2xs text-status-danger">{costCheck.error}</p>}
          </div>
        </div>
        <div>
          <label htmlFor="pv-url" className={LABEL}>Product link</label>
          <Input id="pv-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} placeholder="https://… (optional)" aria-invalid={urlError !== null} className={urlError ? 'border-status-danger/60 focus:border-status-danger' : ''} />
          {urlError && <p className="mt-1 text-2xs text-status-danger">{urlError}</p>}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="pv-notes" className={LABEL}>Availability / ordering notes</label>
            <Input id="pv-notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} disabled={busy} placeholder="e.g. ships in 2 days" />
          </div>
          <div>
            <label htmlFor="pv-verified" className={LABEL}>Last verified</label>
            <Input id="pv-verified" type="date" value={verified} onChange={(e) => setVerified(e.target.value)} disabled={busy} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-text-secondary">
          <input type="checkbox" checked={preferred} onChange={(e) => setPreferred(e.target.checked)} disabled={busy} />
          Preferred vendor for this part <span className="text-text-muted">(choosing this replaces the current preferred vendor)</span>
        </label>
        {error && <p className="text-status-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !valid}>
            {busy ? 'Saving…' : mode === 'add' ? 'Link vendor' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// Where we buy this part, and at what price. A part can have several vendors; one can be preferred.
export default function PartVendorsPanel({ partId, links, availableVendors, canManage, canOpenVendors }: PartVendorsPanelProps) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<PartVendorLink | null>(null)
  const [removing, setRemoving] = useState<PartVendorLink | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function setPreferred(l: PartVendorLink) {
    setBusy(true)
    setError(null)
    try {
      await updatePartVendor(createClient(), partId, l.vendor_id, { is_preferred: true })
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not change the preferred vendor.'))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!removing) return
    setBusy(true)
    setError(null)
    try {
      await removePartVendor(createClient(), partId, removing.vendor_id)
      setRemoving(null)
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not remove the vendor.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
          <Store size={13} className="text-accent-blue" /> Where to buy it
        </h2>
        {canManage && (
          <Button size="sm" variant="secondary" disabled={availableVendors.length === 0} onClick={() => { setError(null); setAdding(true) }}>
            <Plus size={12} /> Link a vendor
          </Button>
        )}
      </div>
      {error && !adding && !editing && <p className="mb-2 text-xs text-status-danger">{error}</p>}
      {canManage && availableVendors.length === 0 && <p className="mb-2 text-[12px] text-text-muted">Every active vendor is already linked, or the vendor directory is empty. A Business member adds vendors on the Vendors page.</p>}

      {links.length === 0 ? (
        <p className="text-[12px] text-text-muted">No vendor is linked to this part yet.</p>
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b border-border text-2xs font-medium text-text-muted">
                <th scope="col" className="py-2 pr-2 font-medium">Vendor</th>
                <th scope="col" className="px-2 py-2 font-medium">Order #</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Unit cost</th>
                <th scope="col" className="px-2 py-2 font-medium">Link</th>
                <th scope="col" className="px-2 py-2 font-medium">Verified</th>
                {canManage && <th scope="col" className="py-2 pl-2 text-right font-medium"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {links.map((l) => (
                <tr key={l.vendor_id} className="align-top">
                  <td className="py-2.5 pr-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {canOpenVendors && l.vendor ? (
                        <Link href={`/business/vendors/${l.vendor_id}`} className="font-medium text-text-primary hover:text-accent-blue">
                          {l.vendor.name}
                        </Link>
                      ) : (
                        <span className="font-medium text-text-primary">{l.vendor?.name ?? 'Vendor'}</span>
                      )}
                      {l.is_preferred && (
                        <Badge tone="gold">
                          <span className="inline-flex items-center gap-1">
                            <Star size={10} aria-hidden="true" /> Preferred
                          </span>
                        </Badge>
                      )}
                      {l.vendor && !l.vendor.active && <Badge tone="slate">Inactive vendor</Badge>}
                    </div>
                    {l.availability_notes && <div className="mt-0.5 text-2xs text-text-muted">{l.availability_notes}</div>}
                  </td>
                  <td className="px-2 py-2.5 font-mono text-[12px] text-text-secondary">{l.vendor_part_number ?? '—'}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-text-primary">{formatUsd(l.unit_cost)}</td>
                  <td className="px-2 py-2.5">
                    {l.product_url ? (
                      <a href={l.product_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-blue hover:underline">
                        Open <ExternalLink size={11} aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-text-muted">{l.last_verified_on ? formatDate(l.last_verified_on) : '—'}</td>
                  {canManage && (
                    <td className="py-2.5 pl-2 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {!l.is_preferred && (
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPreferred(l)}>
                            Make preferred
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => { setError(null); setEditing(l) }}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setError(null); setRemoving(l) }}>
                          Remove
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && <LinkForm mode="add" vendors={availableVendors} onClose={() => setAdding(false)} partId={partId} />}
      {editing && <LinkForm key={editing.vendor_id} mode="edit" vendors={[]} link={editing} onClose={() => setEditing(null)} partId={partId} />}
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        title="Unlink this vendor?"
        description={<p>{removing?.vendor?.name} will no longer be listed as a source for this part. The vendor itself and past purchases are not affected. The change is recorded in the audit log.</p>}
        confirmLabel="Unlink"
        busyLabel="Unlinking…"
        busy={busy}
        error={error}
      />
    </Panel>
  )
}

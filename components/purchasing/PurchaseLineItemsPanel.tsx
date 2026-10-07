'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Link as LinkIcon, Package } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { createClient } from '@/lib/supabase/client'
import { addPurchaseRequestItem, updatePurchaseRequestItem, deletePurchaseRequestItem } from '@/lib/supabase/queries/purchasing'
import { validateProductUrl } from '@/lib/validation'
import { getErrorMessage } from '@/lib/errors'
import { vendorName } from '@/lib/purchaseSheet/format'
import { prefillFromPart, prefillFromVendor } from '@/lib/parts'
import { CatalogPartPicker, CatalogVendorPicker, fetchPreferredLink, type PickedPart, type PickedVendor } from '@/components/purchasing/CatalogPickers'
import type { PurchaseRequestItem, SubsystemMember } from '@/types/database'

interface PurchaseLineItemsPanelProps {
  purchaseRequestId: string
  items: PurchaseRequestItem[]
  canManage: boolean
  // The order's default vendor (older requests may carry one) and the team's members, for choosing who
  // is responsible for an item. An item with no vendor of its own or no responsible member falls back
  // to these, and to the person who placed the request.
  requestVendor: string | null
  members: SubsystemMember[]
  requesterName: string
}

function formatCurrency(value: number | null): string {
  if (value === null) return '—'
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

const nameOf = (p: { display_name: string | null; email: string | null } | null | undefined) => p?.display_name || p?.email || ''

export default function PurchaseLineItemsPanel({ purchaseRequestId, items, canManage, requestVendor, members, requesterName }: PurchaseLineItemsPanelProps) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [description, setDescription] = useState('')
  const [vendor, setVendor] = useState('')
  const [responsibleId, setResponsibleId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitCost, setUnitCost] = useState('')
  const [link, setLink] = useState('')
  const [partNumber, setPartNumber] = useState('')
  const [subassembly, setSubassembly] = useState('')
  // optional catalog links (migration 0037); the typed fields remain the record
  const [pickedPart, setPickedPart] = useState<PickedPart | null>(null)
  const [pickedVendor, setPickedVendor] = useState<PickedVendor | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lineTotal = (item: PurchaseRequestItem) => (item.unit_cost !== null ? item.unit_cost * item.quantity : null)
  const total = items.reduce((sum, item) => sum + (item.unit_cost ?? 0) * item.quantity, 0)
  const vendorOf = (item: PurchaseRequestItem) => vendorName(item.vendor, requestVendor, item.link)

  // one team order can buy from several vendors: show what each vendor's part of the order comes to
  const byVendor = new Map<string, { items: number; total: number }>()
  for (const item of items) {
    const key = vendorOf(item) || 'No vendor'
    const entry = byVendor.get(key) ?? { items: 0, total: 0 }
    entry.items += 1
    entry.total += (item.unit_cost ?? 0) * item.quantity
    byVendor.set(key, entry)
  }

  // members you can hand an item to; keep a current assignee who is no longer on the roster selectable
  const memberOptions = members
    .filter((m) => m.profile)
    .map((m) => ({ id: m.user_id, name: nameOf(m.profile) }))
  const withCurrent = (current: PurchaseRequestItem) =>
    current.responsible_user_id && !memberOptions.some((o) => o.id === current.responsible_user_id)
      ? [...memberOptions, { id: current.responsible_user_id, name: nameOf(current.responsible) || 'Former member' }]
      : memberOptions

  // Every line item needs a product link (also enforced by the database, migration 0022).
  const linkError = validateProductUrl(link)
  const showLinkError = linkError !== null && link.trim() !== ''

  const currentText = () => ({ itemDescription: description, partNumber, vendor, unitCost, link })
  const applyText = (t: { itemDescription: string; partNumber: string; vendor: string; unitCost: string; link: string }) => {
    setDescription(t.itemDescription)
    setPartNumber(t.partNumber)
    setVendor(t.vendor)
    setUnitCost(t.unitCost)
    setLink(t.link)
  }

  async function handlePickPart(part: PickedPart | null) {
    setPickedPart(part)
    if (!part) return
    const preferred = await fetchPreferredLink(part.id).catch(() => null)
    applyText(prefillFromPart(currentText(), part, preferred))
    if (!pickedVendor && part.preferred_vendor_id && part.preferred_vendor_name) setPickedVendor({ id: part.preferred_vendor_id, name: part.preferred_vendor_name, website: null })
  }

  function handlePickVendor(v: PickedVendor | null) {
    setPickedVendor(v)
    if (v) applyText(prefillFromVendor(currentText(), v))
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (linkError) return
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await addPurchaseRequestItem(supabase, {
        purchase_request_id: purchaseRequestId,
        description,
        quantity: Number(quantity) || 1,
        unit_cost: unitCost ? Number(unitCost) : null,
        link: link.trim(),
        part_number: partNumber.trim() || null,
        subassembly: subassembly.trim() || null,
        vendor: vendor.trim() || null,
        responsible_user_id: responsibleId || null,
        // sent only when a catalog record was chosen (undefined is omitted from the request)
        part_id: pickedPart?.id ?? undefined,
        vendor_id: pickedVendor?.id ?? undefined,
      })
      setPickedPart(null)
      setPickedVendor(null)
      setPartNumber('')
      setSubassembly('')
      setVendor('')
      setResponsibleId('')
      setDescription('')
      setQuantity('1')
      setUnitCost('')
      setLink('')
      setAdding(false)
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not add line item.'))
    } finally {
      setBusy(false)
    }
  }

  async function update(itemId: string, patch: Record<string, unknown>, failure: string) {
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await updatePurchaseRequestItem(supabase, itemId, patch)
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, failure))
    } finally {
      setBusy(false)
    }
  }

  async function handleQuantityChange(itemId: string, next: string) {
    const value = Number(next)
    if (!Number.isFinite(value) || value <= 0) return
    await update(itemId, { quantity: value }, 'Could not update quantity.')
  }

  // Vendor, Part # and Subassembly are plain optional text; clearing one stores NULL (the database refuses empty strings).
  async function handleTextChange(itemId: string, field: 'vendor' | 'part_number' | 'subassembly', next: string) {
    await update(itemId, { [field]: next.trim() || null }, 'Could not save this change.')
  }

  async function handleRemove(itemId: string) {
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await deletePurchaseRequestItem(supabase, itemId)
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not remove line item.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Line items <span className="ml-1 text-xs font-normal text-text-muted">{items.length}</span></h2>
        {canManage && !adding && (
          <Button type="button" size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus size={12} /> Add item
          </Button>
        )}
      </div>

      {error && <p className="mb-2 text-[12px] text-status-danger">{error}</p>}

      {items.length === 0 && !adding ? (
        <EmptyState icon={Package} title="No line items yet" description="Add parts, quantities, vendors and product links to this order." />
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[820px] text-xs">
            <thead>
              <tr className="border-b border-border text-left text-2xs text-text-muted">
                <th className="pb-2 font-medium">Description</th>
                <th className="pb-2 font-medium">Vendor</th>
                <th className="pb-2 font-medium">Part #</th>
                <th className="pb-2 font-medium">Subassembly</th>
                <th className="pb-2 font-medium">Responsible</th>
                <th className="pb-2 pr-2 text-right font-medium">Qty</th>
                <th className="whitespace-nowrap pb-2 pr-2 text-right font-medium">Unit cost</th>
                <th className="whitespace-nowrap pb-2 pr-2 text-right font-medium">Line total</th>
                <th className="pb-2 font-medium">Link</th>
                {canManage && <th className="pb-2"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="py-2 pr-2 text-text-primary">
                    {item.description}
                    {item.notes && <div className="text-2xs text-text-muted">{item.notes}</div>}
                    {(item.part_id || item.vendor_id) && (
                      <div className="mt-0.5 text-2xs text-text-muted">
                        Catalog:{' '}
                        {item.part_id && (
                          <Link href={`/parts/${item.part_id}`} className="text-accent-blue hover:underline">
                            part
                          </Link>
                        )}
                        {item.part_id && item.vendor_id && ' · '}
                        {item.vendor_id && <span>vendor</span>}
                      </div>
                    )}
                  </td>
                  {(['vendor', 'part_number', 'subassembly'] as const).map((field) => (
                    <td key={field} className="py-2 pr-2 text-text-secondary">
                      {canManage ? (
                        <Input
                          defaultValue={item[field] ?? ''}
                          maxLength={100}
                          disabled={busy}
                          placeholder={field === 'vendor' ? vendorOf(item) || '—' : '—'}
                          onBlur={(e) => e.target.value.trim() !== (item[field] ?? '') && handleTextChange(item.id, field, e.target.value)}
                          className="w-28"
                        />
                      ) : field === 'vendor' ? (
                        vendorOf(item) || '—'
                      ) : (
                        item[field] || '—'
                      )}
                    </td>
                  ))}
                  <td className="py-2 pr-2 text-text-secondary">
                    {canManage ? (
                      <Select
                        defaultValue={item.responsible_user_id ?? ''}
                        disabled={busy}
                        onChange={(e) => update(item.id, { responsible_user_id: e.target.value || null }, 'Could not change the responsible member.')}
                        className="w-36"
                      >
                        <option value="">{requesterName ? `${requesterName} (requester)` : 'Requester'}</option>
                        {withCurrent(item).map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      nameOf(item.responsible) || requesterName || '—'
                    )}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {canManage ? (
                      <Input
                        type="number"
                        min={1}
                        defaultValue={item.quantity}
                        disabled={busy}
                        onBlur={(e) => e.target.value !== String(item.quantity) && handleQuantityChange(item.id, e.target.value)}
                        className="w-16"
                      />
                    ) : (
                      item.quantity
                    )}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-text-secondary">{formatCurrency(item.unit_cost)}</td>
                  <td className="py-2 pr-2 text-right font-medium tabular-nums text-text-primary">{formatCurrency(lineTotal(item))}</td>
                  <td className="py-2 pr-2">
                    {item.link && (
                      <a aria-label="Open item link (opens in a new tab)" href={item.link} target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:underline">
                        <LinkIcon size={12} />
                      </a>
                    )}
                  </td>
                  {canManage && (
                    <td className="py-2 text-right">
                      <button aria-label="Remove this item" type="button" disabled={busy} onClick={() => handleRemove(item.id)} className="text-text-muted hover:text-status-danger">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr className="border-t border-border">
                  <td colSpan={7} className="pt-3 pr-2 text-right text-2xs font-medium text-text-muted">
                    Total
                  </td>
                  <td className="pt-3 pr-2 text-right text-sm font-semibold tabular-nums text-text-primary">{formatCurrency(total)}</td>
                  <td colSpan={canManage ? 2 : 1}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {byVendor.size > 1 && (
        <div className="mt-3 border-t border-border pt-3">
          <h3 className="mb-1.5 text-xs font-medium text-text-secondary">By vendor</h3>
          <ul className="space-y-1 text-xs">
            {Array.from(byVendor.entries()).map(([name, v]) => (
              <li key={name} className="flex items-center justify-between gap-3">
                <span className="text-text-primary">
                  {name} <span className="text-text-muted">· {v.items} item{v.items === 1 ? '' : 's'}</span>
                </span>
                <span className="tabular-nums text-text-secondary">{formatCurrency(v.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canManage && adding && (
        <form onSubmit={handleAdd} noValidate className="mt-3 space-y-2 border-t border-border pt-3 text-xs">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <CatalogPartPicker selected={pickedPart} onChange={handlePickPart} disabled={busy} />
            <CatalogVendorPicker selected={pickedVendor} onChange={handlePickVendor} disabled={busy} />
          </div>
          <p className="text-[12px] text-text-muted">Optional. Picking a catalog part or vendor fills the blank fields below; you can still type or change anything.</p>
          <Input required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Item description" />
          <div className="grid grid-cols-2 gap-2">
            <Input value={vendor} maxLength={100} onChange={(e) => setVendor(e.target.value)} placeholder={requestVendor ? `Vendor (default ${requestVendor})` : "Vendor (else the link's site)"} />
            <Select value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)} aria-label="Member responsible">
              <option value="">{requesterName ? `Responsible: ${requesterName} (requester)` : 'Responsible: requester'}</option>
              {memberOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  Responsible: {o.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input value={partNumber} maxLength={100} onChange={(e) => setPartNumber(e.target.value)} placeholder="Part # (optional)" />
            <Input value={subassembly} maxLength={100} onChange={(e) => setSubassembly(e.target.value)} placeholder="Subassembly (optional)" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Qty" />
            <Input type="number" min={0} step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="Unit cost" />
            <Input
              type="url"
              inputMode="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              aria-required="true"
              aria-invalid={showLinkError}
              placeholder="Product link (required)"
              className={showLinkError ? 'border-status-danger/60 focus:border-status-danger' : ''}
            />
          </div>
          {showLinkError && <p className="text-[12px] text-status-danger">{linkError}</p>}
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={busy || !description || linkError !== null}>
              Add
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Panel>
  )
}

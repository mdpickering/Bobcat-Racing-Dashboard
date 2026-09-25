'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { createPurchaseRequest } from '@/lib/supabase/queries/purchasing'
import { validateProductUrl } from '@/lib/validation'
import { getErrorMessage } from '@/lib/errors'
import type { Subsystem } from '@/types/database'

interface CreatePurchaseRequestModalProps {
  open: boolean
  onClose: () => void
  subsystems: Subsystem[]
  defaultSubsystemId?: string
}

const LABEL = 'mb-1 block font-mono text-[10px] uppercase text-text-muted'

// A purchase request is a TEAM's order. It starts with its first item; the rest of the order (more items,
// each from any vendor) is added on the request's page.
export default function CreatePurchaseRequestModal({ open, onClose, subsystems, defaultSubsystemId }: CreatePurchaseRequestModalProps) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [subsystemId, setSubsystemId] = useState(defaultSubsystemId ?? subsystems[0]?.id ?? '')
  const [itemDescription, setItemDescription] = useState('')
  const [vendor, setVendor] = useState('')
  const [productUrl, setProductUrl] = useState('')
  const [partNumber, setPartNumber] = useState('')
  const [subassembly, setSubassembly] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitCost, setUnitCost] = useState('')
  const [urlTouched, setUrlTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const urlError = validateProductUrl(productUrl)
  // Blank-but-untouched stays quiet (the submit button is already disabled and the label says
  // required); as soon as the field has been used or holds text, say exactly what's wrong.
  const showUrlError = urlError !== null && (urlTouched || productUrl.trim() !== '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setUrlTouched(true)
    if (urlError) return
    setError(null)
    setSubmitting(true)
    try {
      const supabase = createClient()
      const id = await createPurchaseRequest(supabase, {
        subsystem_id: subsystemId,
        title,
        description: description || null,
        product_url: productUrl.trim(),
        item_description: itemDescription,
        item_vendor: vendor,
        part_number: partNumber,
        subassembly,
        quantity: Math.max(1, Math.floor(Number(quantity)) || 1),
        unit_cost: unitCost ? Number(unitCost) : null,
      })
      onClose()
      setTitle('')
      setDescription('')
      setItemDescription('')
      setVendor('')
      setProductUrl('')
      setPartNumber('')
      setSubassembly('')
      setQuantity('1')
      setUnitCost('')
      setUrlTouched(false)
      router.refresh()
      router.push(`/purchasing/${id}`)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not create purchase request — you may not have permission for this subsystem.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Purchase Request">
      <form onSubmit={handleSubmit} noValidate className="space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Team</label>
            <Select value={subsystemId} onChange={(e) => setSubsystemId(e.target.value)}>
              {subsystems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className={LABEL}>Order name</label>
            <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Front A-arm parts" />
          </div>
        </div>
        <div>
          <label className={LABEL}>Description</label>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details about this order" />
        </div>

        <div className="border-t border-border pt-3">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-text-muted">First item — add more items, from any vendor, on the next page</p>
          <div className="space-y-3">
            <div>
              <label className={LABEL}>Item</label>
              <Input value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} placeholder="Defaults to the order name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Vendor</label>
                <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="e.g. McMaster (else the link's site)" />
              </div>
              <div>
                <label htmlFor="purchase-product-url" className={LABEL}>
                  Product link <span className="text-rose-400">*</span>
                </label>
                <Input
                  id="purchase-product-url"
                  type="url"
                  inputMode="url"
                  value={productUrl}
                  onChange={(e) => setProductUrl(e.target.value)}
                  onBlur={() => setUrlTouched(true)}
                  aria-required="true"
                  aria-invalid={showUrlError}
                  aria-describedby="purchase-product-url-help"
                  placeholder="https://www.example.com/the-item"
                  className={showUrlError ? 'border-rose-500/60 focus:border-rose-400' : ''}
                />
              </div>
            </div>
            <p id="purchase-product-url-help" className={`-mt-1 text-[11px] ${showUrlError ? 'text-rose-400' : 'text-text-muted'}`}>
              {showUrlError ? urlError : 'The link to the exact item is required.'}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Part #</label>
                <Input value={partNumber} maxLength={100} onChange={(e) => setPartNumber(e.target.value)} placeholder="e.g. 92186A394" />
              </div>
              <div>
                <label className={LABEL}>Subassembly</label>
                <Input value={subassembly} maxLength={100} onChange={(e) => setSubassembly(e.target.value)} placeholder="e.g. front A-Arm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Quantity</label>
                <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Unit cost ($)</label>
                <Input type="number" min={0} step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="Optional" />
              </div>
            </div>
          </div>
        </div>

        {error && <p className="text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !subsystemId || !title.trim() || urlError !== null}>
            {submitting ? 'Creating…' : 'Create Request'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

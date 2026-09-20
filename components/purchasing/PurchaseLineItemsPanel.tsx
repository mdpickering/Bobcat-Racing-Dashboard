'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Link as LinkIcon } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { Package } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { addPurchaseRequestItem, updatePurchaseRequestItem, deletePurchaseRequestItem } from '@/lib/supabase/queries/purchasing'
import { validateProductUrl } from '@/lib/validation'
import { getErrorMessage } from '@/lib/errors'
import type { PurchaseRequestItem } from '@/types/database'

interface PurchaseLineItemsPanelProps {
  purchaseRequestId: string
  items: PurchaseRequestItem[]
  canManage: boolean
}

function formatCurrency(value: number | null): string {
  if (value === null) return '—'
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

export default function PurchaseLineItemsPanel({ purchaseRequestId, items, canManage }: PurchaseLineItemsPanelProps) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitCost, setUnitCost] = useState('')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = items.reduce((sum, item) => sum + (item.unit_cost ?? 0) * item.quantity, 0)

  // Every line item needs a product link (also enforced by the database, migration 0022).
  const linkError = validateProductUrl(link)
  const showLinkError = linkError !== null && link.trim() !== ''

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
      })
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

  async function handleQuantityChange(itemId: string, next: string) {
    const value = Number(next)
    if (!Number.isFinite(value) || value <= 0) return
    setBusy(true)
    try {
      const supabase = createClient()
      await updatePurchaseRequestItem(supabase, itemId, { quantity: value })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update quantity.')
    } finally {
      setBusy(false)
    }
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
        <h3 className="text-xs font-bold uppercase tracking-wide text-text-primary">Line Items</h3>
        {canManage && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="text-[10px] font-mono uppercase text-accent-blue hover:underline">
            <Plus size={11} className="mr-0.5 inline" /> Add item
          </button>
        )}
      </div>

      {error && <p className="mb-2 text-[11px] text-rose-400">{error}</p>}

      {items.length === 0 && !adding ? (
        <EmptyState icon={Package} title="No line items yet" description="Add parts, quantities, and product links to this request." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase text-text-muted">
                <th className="pb-2 font-medium">Description</th>
                <th className="pb-2 font-medium">Qty</th>
                <th className="pb-2 font-medium">Unit Cost</th>
                <th className="pb-2 font-medium">Line Total</th>
                <th className="pb-2 font-medium">Link</th>
                {canManage && <th className="pb-2"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="py-2 pr-2 text-text-primary">
                    {item.description}
                    {item.notes && <div className="text-[10px] text-text-muted">{item.notes}</div>}
                  </td>
                  <td className="py-2 pr-2">
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
                  <td className="py-2 pr-2 text-text-secondary">{formatCurrency(item.unit_cost)}</td>
                  <td className="py-2 pr-2 font-medium text-text-primary">{formatCurrency(item.unit_cost !== null ? item.unit_cost * item.quantity : null)}</td>
                  <td className="py-2 pr-2">
                    {item.link && (
                      <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:underline">
                        <LinkIcon size={12} />
                      </a>
                    )}
                  </td>
                  {canManage && (
                    <td className="py-2 text-right">
                      <button type="button" disabled={busy} onClick={() => handleRemove(item.id)} className="text-text-muted hover:text-rose-400">
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
                  <td colSpan={3} className="pt-2 text-right text-[10px] font-mono uppercase text-text-muted">
                    Total
                  </td>
                  <td className="pt-2 font-bold text-text-primary">{formatCurrency(total)}</td>
                  <td colSpan={canManage ? 2 : 1}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {canManage && adding && (
        <form onSubmit={handleAdd} noValidate className="mt-3 space-y-2 border-t border-border pt-3 text-xs">
          <Input required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Item description" />
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
              className={showLinkError ? 'border-rose-500/60 focus:border-rose-400' : ''}
            />
          </div>
          {showLinkError && <p className="text-[11px] text-rose-400">{linkError}</p>}
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

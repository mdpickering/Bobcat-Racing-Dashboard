'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, Pencil, Plus } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { createClient } from '@/lib/supabase/client'
import { createLocation, updateLocation } from '@/lib/supabase/queries/inventory'
import { getErrorMessage } from '@/lib/errors'
import type { InventoryLocation } from '@/types/database'

const LABEL = 'mb-1 block text-xs text-text-secondary'
const emptyForm = { name: '', description: '', sort_order: '100' }

// Locations are never deleted (no delete grant on inventory_locations, migration 0038) — only deactivated. This
// preserves every location that has ever appeared in the ledger, exactly like Parts and Vendors do for their own
// records. Admin/CTO/COO only; the database is the real gate (can_manage_inventory()).
export default function LocationManagerModal({ open, onClose, locations }: { open: boolean; onClose: () => void; locations: InventoryLocation[] }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }))
  const startAdd = () => { setForm(emptyForm); setEditingId(null); setAdding(true); setError(null) }
  const startEdit = (loc: InventoryLocation) => { setForm({ name: loc.name, description: loc.description ?? '', sort_order: String(loc.sort_order) }); setEditingId(loc.id); setAdding(true); setError(null) }
  const cancelForm = () => { if (busy) return; setAdding(false); setEditingId(null) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.name.trim() === '' || busy) return
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      const values = { name: form.name.trim(), description: form.description.trim() || null, sort_order: Number(form.sort_order) || 100 }
      if (editingId) await updateLocation(supabase, editingId, values)
      else await createLocation(supabase, values)
      setAdding(false)
      setEditingId(null)
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save the location.'))
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(loc: InventoryLocation) {
    setBusy(true)
    setError(null)
    try {
      await updateLocation(createClient(), loc.id, { active: !loc.active })
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not change the status.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title="Manage locations" maxWidthClassName="max-w-lg">
      <div className="space-y-4 text-xs">
        {error && <p className="text-status-danger">{error}</p>}

        {!adding && (
          <>
            {locations.length === 0 ? (
              <EmptyState icon={MapPin} title="No locations yet" description="Add the team's real locations — Shop, Trailer, Team Storage — one at a time. Nothing is invented for you." />
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {locations.map((loc) => (
                  <li key={loc.id} className={`flex items-start justify-between gap-3 px-3 py-2.5 ${loc.active ? '' : 'opacity-60'}`}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-text-primary">{loc.name}</span>
                        {!loc.active && <Badge tone="neutral">Inactive</Badge>}
                      </div>
                      {loc.description && <div className="mt-0.5 text-[11px] text-text-muted">{loc.description}</div>}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <button type="button" title="Edit" disabled={busy} onClick={() => startEdit(loc)} className="text-text-muted hover:text-text-primary">
                        <Pencil size={13} />
                      </button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => toggleActive(loc)}>
                        {loc.active ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Button size="sm" variant="secondary" onClick={startAdd}>
              <Plus size={12} /> Add location
            </Button>
          </>
        )}

        {adding && (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className={LABEL}>
                Name <span className="text-status-danger">*</span>
              </label>
              <Input value={form.name} maxLength={100} onChange={(e) => set('name', e.target.value)} disabled={busy} placeholder="e.g. Shop, Trailer, Team Storage" autoFocus />
            </div>
            <div>
              <label className={LABEL}>Description</label>
              <Textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} disabled={busy} placeholder="Optional" />
            </div>
            <div className="w-32">
              <label className={LABEL}>Sort order</label>
              <Input type="number" value={form.sort_order} onChange={(e) => set('sort_order', e.target.value)} disabled={busy} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" disabled={busy} onClick={cancelForm}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || form.name.trim() === ''}>
                {busy ? 'Saving…' : editingId ? 'Save' : 'Add location'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  )
}

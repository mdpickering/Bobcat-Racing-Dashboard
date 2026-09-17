'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Archive, RotateCcw } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { createTimelineColumn, updateTimelineColumn } from '@/lib/supabase/queries/timeline'
import type { TimelineColumn } from '@/types/database'

interface ManageColumnsModalProps {
  open: boolean
  onClose: () => void
  columns: TimelineColumn[]
}

export default function ManageColumnsModal({ open, onClose, columns }: ManageColumnsModalProps) {
  const router = useRouter()
  const [key, setKey] = useState('')
  const [label, setLabel] = useState('')
  const [sortOrder, setSortOrder] = useState(String((columns[columns.length - 1]?.sort_order ?? 0) + 1))
  const [highlight, setHighlight] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await createTimelineColumn(supabase, { key, label, sort_order: Number(sortOrder) || 0, highlight })
      setKey('')
      setLabel('')
      setHighlight(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add column — key may already be in use.')
    } finally {
      setBusy(false)
    }
  }

  async function handleUpdate(colKey: string, patch: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await updateTimelineColumn(supabase, colKey, patch)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update column.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Manage Timeline Columns" maxWidthClassName="max-w-2xl">
      <div className="space-y-4 text-xs">
        {error && <p className="text-rose-400">{error}</p>}

        <div className="space-y-1.5">
          {columns.map((col) => (
            <div key={col.key} className={`flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 ${!col.active ? 'opacity-50' : ''}`}>
              <Input
                defaultValue={col.label}
                disabled={busy}
                onBlur={(e) => e.target.value !== col.label && handleUpdate(col.key, { label: e.target.value })}
                className="flex-1"
              />
              <Input
                type="number"
                defaultValue={col.sort_order}
                disabled={busy}
                onBlur={(e) => Number(e.target.value) !== col.sort_order && handleUpdate(col.key, { sort_order: Number(e.target.value) })}
                className="w-16"
              />
              <label className="flex items-center gap-1 text-[10px] text-text-muted">
                <input type="checkbox" checked={col.highlight} disabled={busy} onChange={(e) => handleUpdate(col.key, { highlight: e.target.checked })} />
                Highlight
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleUpdate(col.key, { active: !col.active })}
                title={col.active ? 'Archive' : 'Restore'}
                className="flex-shrink-0 text-text-muted hover:text-accent-blue"
              >
                {col.active ? <Archive size={13} /> : <RotateCcw size={13} />}
              </button>
            </div>
          ))}
        </div>

        <form onSubmit={handleAdd} className="space-y-2 border-t border-border pt-3">
          <p className="font-mono text-[10px] uppercase text-text-muted">Add Column</p>
          <div className="grid grid-cols-3 gap-2">
            <Input required value={key} onChange={(e) => setKey(e.target.value)} placeholder="Key (e.g. w16)" />
            <Input required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. W16)" />
            <Input required type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} placeholder="Order" />
          </div>
          <label className="flex items-center gap-1.5 text-[10px] text-text-muted">
            <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} /> Highlight this column
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button type="submit" disabled={busy || !key || !label}>
              <Plus size={12} /> Add Column
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  )
}

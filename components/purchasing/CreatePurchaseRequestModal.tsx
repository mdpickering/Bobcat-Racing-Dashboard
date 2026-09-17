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
import type { Subsystem } from '@/types/database'

interface CreatePurchaseRequestModalProps {
  open: boolean
  onClose: () => void
  subsystems: Subsystem[]
  defaultSubsystemId?: string
}

export default function CreatePurchaseRequestModal({ open, onClose, subsystems, defaultSubsystemId }: CreatePurchaseRequestModalProps) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [vendor, setVendor] = useState('')
  const [subsystemId, setSubsystemId] = useState(defaultSubsystemId ?? subsystems[0]?.id ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const supabase = createClient()
      const pr = await createPurchaseRequest(supabase, {
        subsystem_id: subsystemId,
        title,
        description: description || null,
        vendor: vendor || null,
      })
      onClose()
      router.refresh()
      router.push(`/purchasing/${pr.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create purchase request — you may not have permission for this subsystem.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Purchase Request">
      <form onSubmit={handleSubmit} className="space-y-3 text-xs">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Title</label>
          <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Suspension bushings" />
        </div>
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Description</label>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Subsystem</label>
            <Select value={subsystemId} onChange={(e) => setSubsystemId(e.target.value)}>
              {subsystems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Vendor</label>
            <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        {error && <p className="text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !subsystemId}>
            {submitting ? 'Creating…' : 'Create Request'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { createMilestone } from '@/lib/supabase/queries/calendar'
import type { Subsystem } from '@/types/database'

interface CreateMilestoneModalProps {
  open: boolean
  onClose: () => void
  subsystemOptions: Subsystem[]
  isCtoOrAdmin: boolean
}

export default function CreateMilestoneModal({ open, onClose, subsystemOptions, isCtoOrAdmin }: CreateMilestoneModalProps) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [subsystemId, setSubsystemId] = useState(isCtoOrAdmin ? '' : subsystemOptions[0]?.id ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const supabase = createClient()
      await createMilestone(supabase, { name, date, description: description || null, subsystem_id: subsystemId || null })
      onClose()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create milestone.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Milestone">
      <form onSubmit={handleSubmit} className="space-y-3 text-xs">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Name</label>
          <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Design freeze" />
        </div>
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Date</label>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Description</label>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details" />
        </div>
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Subsystem</label>
          <Select value={subsystemId} onChange={(e) => setSubsystemId(e.target.value)}>
            {isCtoOrAdmin && <option value="">Team-wide</option>}
            {subsystemOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        {error && <p className="text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !date || (!isCtoOrAdmin && !subsystemId)}>
            {submitting ? 'Creating…' : 'Create Milestone'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { createSubsystem } from '@/lib/supabase/queries/subsystems'

export default function CreateSubsystemModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const supabase = createClient()
      const subsystem = await createSubsystem(supabase, { id, name, description: description || null })
      onClose()
      router.refresh()
      router.push(`/subsystems/${subsystem.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create subsystem — the id may already be in use.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Subsystem">
      <form onSubmit={handleSubmit} className="space-y-3 text-xs">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Id (permanent, lowercase-dash)</label>
          <Input required value={id} onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="e.g. brakes" />
        </div>
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Name</label>
          <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Brakes" />
        </div>
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Description</label>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details" />
        </div>
        {error && <p className="text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !id || !name}>
            {submitting ? 'Creating…' : 'Create Subsystem'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

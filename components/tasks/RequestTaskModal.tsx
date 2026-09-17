'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { createTaskRequest } from '@/lib/supabase/queries/tasks'
import type { Subsystem } from '@/types/database'

export default function RequestTaskModal({ open, onClose, subsystems }: { open: boolean; onClose: () => void; subsystems: Subsystem[] }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [subsystemId, setSubsystemId] = useState(subsystems[0]?.id ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const supabase = createClient()
      await createTaskRequest(supabase, { subsystem_id: subsystemId, title, description: description || null })
      setDone(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your request.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleClose() {
    setDone(false)
    setTitle('')
    setDescription('')
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Request a Task">
      {done ? (
        <div className="space-y-3 text-xs">
          <p className="text-text-secondary">
            Your request has been submitted for review by that subsystem&apos;s lead.
          </p>
          <div className="flex justify-end">
            <Button onClick={handleClose}>Done</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
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
            <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">What needs to get done?</label>
            <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Design a new mounting bracket" />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Why / details</label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional context for the reviewer" />
          </div>
          {error && <p className="text-rose-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !subsystemId}>
              {submitting ? 'Submitting…' : 'Submit Request'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

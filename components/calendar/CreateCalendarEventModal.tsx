'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { createCalendarEvent } from '@/lib/supabase/queries/calendar'
import type { Subsystem } from '@/types/database'

interface CreateCalendarEventModalProps {
  open: boolean
  onClose: () => void
  subsystemOptions: Subsystem[]
  isCtoOrAdmin: boolean
}

function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function CreateCalendarEventModal({ open, onClose, subsystemOptions, isCtoOrAdmin }: CreateCalendarEventModalProps) {
  const router = useRouter()
  const now = new Date()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [subsystemId, setSubsystemId] = useState(isCtoOrAdmin ? '' : subsystemOptions[0]?.id ?? '')
  const [startTime, setStartTime] = useState(toLocalInputValue(now))
  const [endTime, setEndTime] = useState(toLocalInputValue(new Date(now.getTime() + 60 * 60 * 1000)))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const supabase = createClient()
      await createCalendarEvent(supabase, {
        title,
        description: description || null,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        subsystem_id: subsystemId || null,
      })
      onClose()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create event.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Calendar Event">
      <form onSubmit={handleSubmit} className="space-y-3 text-xs">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Title</label>
          <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Team meeting" />
        </div>
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Description</label>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Starts</label>
            <Input required type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Ends</label>
            <Input required type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
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
          <Button type="submit" disabled={submitting || (!isCtoOrAdmin && !subsystemId)}>
            {submitting ? 'Creating…' : 'Create Event'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

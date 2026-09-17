'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { createCadReview } from '@/lib/supabase/queries/cad'
import { listTasks } from '@/lib/supabase/queries/tasks'
import type { Subsystem, Task } from '@/types/database'

interface CreateCadReviewModalProps {
  open: boolean
  onClose: () => void
  subsystems: Subsystem[]
  defaultSubsystemId?: string
}

export default function CreateCadReviewModal({ open, onClose, subsystems, defaultSubsystemId }: CreateCadReviewModalProps) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [subsystemId, setSubsystemId] = useState(defaultSubsystemId ?? subsystems[0]?.id ?? '')
  const [taskId, setTaskId] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !subsystemId) return
    const supabase = createClient()
    listTasks(supabase, { subsystemId })
      .then(setTasks)
      .catch(() => setTasks([]))
  }, [open, subsystemId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const supabase = createClient()
      const review = await createCadReview(supabase, {
        subsystem_id: subsystemId,
        task_id: taskId || null,
        title,
        description: description || null,
      })
      onClose()
      router.refresh()
      router.push(`/cad/${review.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit CAD review — you may not have permission for this subsystem.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Submit CAD Review">
      <form onSubmit={handleSubmit} className="space-y-3 text-xs">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Title</label>
          <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Rear upright v2" />
        </div>
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Description</label>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Subsystem</label>
            <Select value={subsystemId} onChange={(e) => { setSubsystemId(e.target.value); setTaskId('') }}>
              {subsystems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Related Task</label>
            <Select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">None</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {error && <p className="text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !subsystemId}>
            {submitting ? 'Creating…' : 'Create Draft'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

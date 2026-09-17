'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { createTask } from '@/lib/supabase/queries/tasks'
import type { Subsystem, SubsystemCategory } from '@/types/database'

interface CreateTaskModalProps {
  open: boolean
  onClose: () => void
  subsystems: Subsystem[]
  categories: SubsystemCategory[]
  defaultSubsystemId?: string
}

export default function CreateTaskModal({ open, onClose, subsystems, categories, defaultSubsystemId }: CreateTaskModalProps) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [subsystemId, setSubsystemId] = useState(defaultSubsystemId ?? subsystems[0]?.id ?? '')
  const [categoryId, setCategoryId] = useState('')
  const [priority, setPriority] = useState('Medium')
  const [deadline, setDeadline] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredCategories = categories.filter((c) => c.subsystem_id === subsystemId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const supabase = createClient()
      const task = await createTask(supabase, {
        title,
        description: description || null,
        subsystem_id: subsystemId,
        category_id: categoryId || null,
        priority,
        deadline: deadline ? new Date(deadline).toISOString() : null,
      })
      onClose()
      router.refresh()
      router.push(`/tasks/${task.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create task — you may not have permission for this subsystem.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Task">
      <form onSubmit={handleSubmit} className="space-y-3 text-xs">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Title</label>
          <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Machine rear upright" />
        </div>
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Description</label>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Subsystem</label>
            <Select value={subsystemId} onChange={(e) => { setSubsystemId(e.target.value); setCategoryId('') }}>
              {subsystems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Category</label>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">None</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Priority</label>
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {['Critical', 'High', 'Medium', 'Low'].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Deadline</label>
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !subsystemId}>
            {submitting ? 'Creating…' : 'Create Task'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

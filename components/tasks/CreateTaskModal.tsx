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
import { pastDateNote } from '@/lib/taskGuards'
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
  // Leaving the deadline off must be a choice, not the default: 55 of the team's 60 open tasks were created without one.
  const [deadlineLater, setDeadlineLater] = useState(false)
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
        deadline: !deadlineLater && deadline ? new Date(deadline).toISOString() : null,
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
          <label className="mb-1 block text-xs text-text-secondary">Title</label>
          <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Machine rear upright" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-secondary">Description</label>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-text-secondary">Subsystem</label>
            <Select value={subsystemId} onChange={(e) => { setSubsystemId(e.target.value); setCategoryId('') }}>
              {subsystems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-secondary">Category</label>
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
            <label className="mb-1 block text-xs text-text-secondary">Priority</label>
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {['Critical', 'High', 'Medium', 'Low'].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="new-task-deadline" className="mb-1 block text-xs text-text-secondary">
              Deadline
            </label>
            <Input id="new-task-deadline" type="date" value={deadlineLater ? '' : deadline} onChange={(e) => setDeadline(e.target.value)} required={!deadlineLater} disabled={deadlineLater} />
          </div>
        </div>
        <div>
          <label className="flex items-center gap-2 text-text-secondary">
            <input type="checkbox" checked={deadlineLater} onChange={(e) => setDeadlineLater(e.target.checked)} className="h-4 w-4 accent-accent-blue" />
            I will set the deadline later
          </label>
          <p className="mt-1 text-2xs text-text-muted">
            {deadlineLater
              ? 'A task without a deadline will not appear in Upcoming or trigger overdue warnings until one is set.'
              : pastDateNote(deadline || null, 'To Do') ?? 'Tasks with a deadline appear in Upcoming and are flagged when late.'}
          </p>
        </div>
        {error && <p className="text-status-danger">{error}</p>}
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

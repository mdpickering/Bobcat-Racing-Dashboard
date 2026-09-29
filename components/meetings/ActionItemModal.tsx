'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Select from '@/components/ui/Select'
import { createClient } from '@/lib/supabase/client'
import { createActionItem, updateActionItem } from '@/lib/supabase/queries/meetings'
import { getErrorMessage } from '@/lib/errors'
import type { Subsystem } from '@/types/database'
import type { TechnicalMeetingActionItem } from '@/types/database'

interface AssignableProfile {
  id: string
  display_name: string | null
  email: string | null
}

interface ActionItemModalProps {
  open: boolean
  onClose: () => void
  meetingId: string
  agendaItemId: string | null
  editing: TechnicalMeetingActionItem | null
  subsystems: Subsystem[]
  assignableProfiles: AssignableProfile[]
}

export default function ActionItemModal({ open, onClose, meetingId, agendaItemId, editing, subsystems, assignableProfiles }: ActionItemModalProps) {
  const router = useRouter()
  const [title, setTitle] = useState(editing?.title ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [assignedTo, setAssignedTo] = useState(editing?.assigned_to ?? '')
  const [dueDate, setDueDate] = useState(editing?.due_date ?? '')
  const [subsystemId, setSubsystemId] = useState(editing?.subsystem_id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  function reset() {
    setTitle(editing?.title ?? '')
    setDescription(editing?.description ?? '')
    setAssignedTo(editing?.assigned_to ?? '')
    setDueDate(editing?.due_date ?? '')
    setSubsystemId(editing?.subsystem_id ?? '')
    setError(null)
  }

  const close = () => {
    if (busy) return
    reset()
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      const patch = {
        title: title.trim(),
        description: description.trim() || null,
        assigned_to: assignedTo || null,
        due_date: dueDate || null,
        subsystem_id: subsystemId || null,
      }
      if (editing) {
        await updateActionItem(supabase, editing.id, patch)
      } else {
        await createActionItem(supabase, { meeting_id: meetingId, agenda_item_id: agendaItemId, ...patch })
      }
      onClose()
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save this action item.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title={editing ? 'Edit action item' : 'New action item'} maxWidthClassName="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-3 text-xs">
        <div>
          <label className="mb-1 block text-text-secondary">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} autoFocus required placeholder="Finalize steering rack mounting" />
        </div>
        <div>
          <label className="mb-1 block text-text-secondary">Description (optional)</label>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-text-secondary">Responsible person</label>
            <Select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} disabled={busy}>
              <option value="">Unassigned</option>
              {assignableProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name || p.email}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-text-secondary">Due date</label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={busy} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-text-secondary">Subsystem (required to later create a task)</label>
          <Select value={subsystemId} onChange={(e) => setSubsystemId(e.target.value)} disabled={busy}>
            <option value="">None</option>
            {subsystems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        {error && <p className="text-status-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !title.trim()}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add action item'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { createClient } from '@/lib/supabase/client'
import { createMeeting } from '@/lib/supabase/queries/meetings'
import { getErrorMessage } from '@/lib/errors'

export default function NewMeetingButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('Weekly Technical Sync')
  const [meetingDate, setMeetingDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    if (busy) return
    setOpen(false)
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !meetingDate) return
    setBusy(true)
    setError(null)
    try {
      const meeting = await createMeeting(createClient(), { title: title.trim(), meeting_date: meetingDate, start_time: startTime || null })
      setOpen(false)
      router.push(`/meetings/${meeting.id}`)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not create this meeting.'))
      setBusy(false)
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => { setOpen(true); setMeetingDate(new Date().toISOString().slice(0, 10)) }}>
        <Plus size={13} /> New meeting
      </Button>

      <Modal open={open} onClose={close} title="New technical meeting" maxWidthClassName="max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="mb-1 block text-text-secondary">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} autoFocus required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-text-secondary">Date</label>
              <Input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} disabled={busy} required />
            </div>
            <div>
              <label className="mb-1 block text-text-secondary">Start time (optional)</label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={busy} />
            </div>
          </div>
          {error && <p className="text-status-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" disabled={busy} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !title.trim() || !meetingDate}>
              {busy ? 'Creating…' : 'Create meeting'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}

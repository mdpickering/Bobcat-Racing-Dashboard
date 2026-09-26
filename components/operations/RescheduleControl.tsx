'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { rescheduleTask } from '@/lib/supabase/queries/operations'
import { deadlineDateKey } from '@/lib/deadline'
import { getErrorMessage } from '@/lib/errors'

// Deadline-only editing that the Operations view already had: it calls reschedule_task(), which the database only
// allows for the COO, CTO and admin and which changes nothing about a task except its deadline. This is the same
// control as before, moved into the new table; it adds no new authority.
export default function RescheduleControl({ taskId, title, deadline }: { taskId: string; title: string; deadline: string | null }) {
  const router = useRouter()
  const current = deadlineDateKey(deadline) ?? ''
  const [value, setValue] = useState(current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(next: string | null) {
    setBusy(true)
    setError(null)
    try {
      await rescheduleTask(createClient(), taskId, next)
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not reschedule this task.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="date"
          aria-label={`Deadline for ${title}`}
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          className="rounded-lg border border-border bg-surface px-2 py-1 text-xs tabular-nums text-text-primary outline-none focus:border-accent-blue"
        />
        <Button size="sm" variant="secondary" disabled={busy || !value || value === current} onClick={() => save(value)}>
          {busy ? 'Saving…' : 'Reschedule'}
        </Button>
        {current && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => save(null)}>
            Clear
          </Button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-status-danger">{error}</p>}
    </div>
  )
}

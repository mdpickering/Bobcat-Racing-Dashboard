'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { acceptTask } from '@/lib/supabase/queries/tasks'
import { getErrorMessage } from '@/lib/errors'
import Button from '@/components/ui/Button'

// Server-side authorization (migration 0024) is the real gate here — this button is shown to
// approved members of the task's own subsystem, but the RPC re-checks that independently, so a
// denied attempt (bypassing the UI, or a stale render) surfaces as a clear error, not a silent no-op.
export default function AcceptTaskButton({ taskId }: { taskId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAccept() {
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await acceptTask(supabase, taskId)
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not accept this task.'))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          handleAccept()
        }}
      >
        {busy ? 'Accepting…' : 'Accept'}
      </Button>
      {error && <span className="max-w-[10rem] text-right text-[10px] text-rose-400">{error}</span>}
    </div>
  )
}

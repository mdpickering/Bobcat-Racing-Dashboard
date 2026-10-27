'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays, Clock, Hand, Undo2 } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Panel from '@/components/ui/Panel'
import { createClient } from '@/lib/supabase/client'
import { claimPickupTask, releasePickupTask } from '@/lib/supabase/queries/pickup'
import { getErrorMessage } from '@/lib/errors'
import { formatDeadline } from '@/lib/deadline'
import { MAX_PICKUP_TASKS, SIZE_HINT, SIZE_LABEL, daysWaiting, waitingLabel, type PickupTask, type TaskSize } from '@/lib/pickup'

const PRIORITY_TONE = { Critical: 'rose', High: 'amber', Medium: 'slate', Low: 'slate' } as const

function SizeBadge({ size }: { size: TaskSize }) {
  return (
    <span title={SIZE_HINT[size]}>
      <Badge tone="sky">
        <span className="inline-flex items-center gap-1">
          <Clock size={11} aria-hidden="true" />
          {SIZE_LABEL[size]}
        </span>
      </Badge>
    </span>
  )
}

// One task on the board. Claiming is a single database call that re-checks everything (still unowned, still open, and
// you have a free slot), so a stale page or a lost race comes back as a plain message rather than a silent failure.
function PickupCard({ task, canClaim, blockedReason }: { task: PickupTask; canClaim: boolean; blockedReason: string | null }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const days = daysWaiting(task.created_at)

  async function claim() {
    setBusy(true)
    setError(null)
    try {
      await claimPickupTask(createClient(), task.id)
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not pick this task up.'))
      // the board may have changed under us; show what is true now
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel className="flex h-full flex-col p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <SizeBadge size={task.size} />
        <Badge tone="slate">{task.subsystem_name}</Badge>
        {(task.priority === 'Critical' || task.priority === 'High') && <Badge tone={PRIORITY_TONE[task.priority]}>{task.priority}</Badge>}
      </div>
      <h3 className="mt-2 text-[13px] font-medium leading-5 text-text-primary">{task.title}</h3>
      {task.description && <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-text-secondary">{task.description}</p>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-text-muted">
          <span>{waitingLabel(days)}</span>
          {task.deadline && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays size={11} aria-hidden="true" /> Due {formatDeadline(task.deadline)}
            </span>
          )}
        </div>
        <Button size="sm" disabled={busy || !canClaim} onClick={claim} title={blockedReason ?? undefined}>
          <Hand size={12} aria-hidden="true" /> {busy ? 'Picking up…' : 'Pick up'}
        </Button>
      </div>
      {!canClaim && blockedReason && <p className="mt-2 text-2xs text-text-muted">{blockedReason}</p>}
      {error && (
        <p role="alert" className="mt-2 text-xs text-status-danger">
          {error}
        </p>
      )}
    </Panel>
  )
}

export function PickupGrid({ tasks, openCount }: { tasks: PickupTask[]; openCount: number }) {
  const full = openCount >= MAX_PICKUP_TASKS
  const blockedReason = full ? `You already have ${MAX_PICKUP_TASKS} pick-up tasks. Finish or put one back first.` : null
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {tasks.map((t) => (
        <li key={t.id}>
          <PickupCard task={t} canClaim={!full} blockedReason={blockedReason} />
        </li>
      ))}
    </ul>
  )
}

export interface MyPickupTask {
  id: string
  title: string
  status: string
  size: TaskSize
}

// What you are holding right now, with a way to put a task back while it has not got further than In Progress.
export function MyPickupPanel({ tasks }: { tasks: MyPickupTask[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function release(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await releasePickupTask(createClient(), id)
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not put this task back.'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Panel className="p-4">
      <h2 className="text-xs font-semibold text-text-primary">
        Your pick-up tasks{' '}
        <span className="font-normal text-text-muted">
          ({tasks.length} of {MAX_PICKUP_TASKS})
        </span>
      </h2>
      {tasks.length === 0 ? (
        <p className="mt-1 text-xs text-text-muted">You have none right now. Pick one up below.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {tasks.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <Link href={`/tasks/${t.id}`} className="text-xs font-medium text-text-primary hover:text-accent-blue">
                  {t.title}
                </Link>
                <div className="mt-0.5 flex items-center gap-2 text-2xs text-text-muted">
                  <span>{SIZE_LABEL[t.size]}</span>
                  <span aria-hidden="true">·</span>
                  <span>{t.status}</span>
                </div>
              </div>
              {(t.status === 'To Do' || t.status === 'In Progress') && (
                <Button size="sm" variant="ghost" disabled={busyId === t.id} onClick={() => release(t.id)}>
                  <Undo2 size={12} aria-hidden="true" /> {busyId === t.id ? 'Putting back…' : 'Put back'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-status-danger">
          {error}
        </p>
      )}
    </Panel>
  )
}

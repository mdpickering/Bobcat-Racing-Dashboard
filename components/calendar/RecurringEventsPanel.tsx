'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Archive, Repeat } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { createClient } from '@/lib/supabase/client'
import { createRecurringEvent, updateRecurringEvent } from '@/lib/supabase/queries/calendar'
import type { RecurringEvent, Subsystem } from '@/types/database'

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface RecurringEventsPanelProps {
  recurringEvents: RecurringEvent[]
  canManage: boolean
  subsystemOptions: Subsystem[]
  isCtoOrAdmin: boolean
  canEditSubsystemIds: Set<string>
}

export default function RecurringEventsPanel({ recurringEvents, canManage, subsystemOptions, isCtoOrAdmin, canEditSubsystemIds }: RecurringEventsPanelProps) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [dayOfWeek, setDayOfWeek] = useState('1')
  const [timeLabel, setTimeLabel] = useState('')
  const [subsystemId, setSubsystemId] = useState(isCtoOrAdmin ? '' : subsystemOptions[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sorted = [...recurringEvents].sort((a, b) => a.day_of_week - b.day_of_week)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await createRecurringEvent(supabase, {
        title,
        day_of_week: Number(dayOfWeek),
        time_label: timeLabel || null,
        subsystem_id: subsystemId || null,
      })
      setTitle('')
      setTimeLabel('')
      setAdding(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add recurring event.')
    } finally {
      setBusy(false)
    }
  }

  async function handleArchive(id: string) {
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await updateRecurringEvent(supabase, id, { active: false })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not archive recurring event.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-text-primary">
          <Repeat size={12} /> Weekly Schedule
        </h3>
        {canManage && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="text-[10px] font-mono uppercase text-accent-blue hover:underline">
            <Plus size={11} className="mr-0.5 inline" /> Add
          </button>
        )}
      </div>

      {error && <p className="mb-2 text-[11px] text-rose-400">{error}</p>}

      {canManage && adding && (
        <form onSubmit={handleAdd} className="mb-3 space-y-2 rounded-lg border border-border p-3 text-xs">
          <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Suspension work session" />
          <div className="grid grid-cols-2 gap-2">
            <Select value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)}>
              {WEEKDAY_NAMES.map((w, i) => (
                <option key={w} value={i}>
                  {w}
                </option>
              ))}
            </Select>
            <Input value={timeLabel} onChange={(e) => setTimeLabel(e.target.value)} placeholder="e.g. 6:00 PM" />
          </div>
          <Select value={subsystemId} onChange={(e) => setSubsystemId(e.target.value)}>
            {isCtoOrAdmin && <option value="">Team-wide</option>}
            {subsystemOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={busy || (!isCtoOrAdmin && !subsystemId)}>
              Add
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {sorted.length === 0 ? (
        <EmptyState icon={Repeat} title="No recurring events" />
      ) : (
        <ul className="space-y-1.5">
          {sorted.map((r) => {
            const editable = isCtoOrAdmin || (!!r.subsystem_id && canEditSubsystemIds.has(r.subsystem_id))
            return (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs">
                <div className="min-w-0">
                  <span className="font-medium text-text-primary">{r.title}</span>
                  <div className="text-[10px] text-text-muted">
                    {WEEKDAY_NAMES[r.day_of_week]}
                    {r.time_label ? ` · ${r.time_label}` : ''}
                    {r.subsystem?.name ? ` · ${r.subsystem.name}` : ' · Team-wide'}
                  </div>
                </div>
                {editable && (
                  <button type="button" disabled={busy} onClick={() => handleArchive(r.id)} className="flex-shrink-0 text-text-muted hover:text-rose-400">
                    <Archive size={13} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

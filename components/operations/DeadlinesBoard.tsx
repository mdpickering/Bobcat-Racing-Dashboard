'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock } from 'lucide-react'
import SectionHeader from '@/components/ui/SectionHeader'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import BulkActionBar from '@/components/ui/BulkActionBar'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { rescheduleTask, type SchedulingTask } from '@/lib/supabase/queries/operations'
import { getErrorMessage } from '@/lib/errors'
import type { DeadlineBucket } from '@/lib/operationsSchedule'
import DeadlineTable from './DeadlineTable'

interface DeadlineGroup {
  bucket: DeadlineBucket
  label: string
  description: string
  tasks: SchedulingTask[]
}

// Owns the cross-group selection so "select 8 Suspension tasks with no deadline, change the
// deadline, apply" works without leaving this page or losing the filters already in the URL
// (Operations → Deadlines' filters are query params, so a client-side selection layer on top of
// them costs nothing — the server page re-filters on every navigation/refresh as it always did).
export default function DeadlinesBoard({ groups, isFiltered, noneCap, today }: { groups: DeadlineGroup[]; isFiltered: boolean; noneCap: number; today: string }) {
  const router = useRouter()
  const toast = useToast()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDate, setBulkDate] = useState('')
  const [applying, setApplying] = useState(false)

  const selectableGroups = useMemo(() => groups.map((g) => ({ ...g, shown: g.bucket === 'none' ? g.tasks.slice(0, noneCap) : g.tasks })), [groups, noneCap])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll(ids: string[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (checked) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  async function applyBulkDeadline() {
    if (!bulkDate || selected.size === 0) return
    setApplying(true)
    try {
      const supabase = createClient()
      const ids = [...selected]
      const results = await Promise.allSettled(ids.map((id) => rescheduleTask(supabase, id, bulkDate)))
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed > 0) toast.push(`${ids.length - failed} of ${ids.length} tasks rescheduled — ${failed} failed.`, 'warning')
      else toast.push(`${ids.length} task${ids.length === 1 ? '' : 's'} rescheduled to that date.`, 'success')
      setSelected(new Set())
      setBulkDate('')
      router.refresh()
    } finally {
      setApplying(false)
    }
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title={isFiltered ? 'No deadlines match these filters' : 'No open tasks'}
        description={isFiltered ? 'Try adjusting or clearing your filters.' : 'When tasks are open, their deadlines appear here grouped by date.'}
      />
    )
  }

  return (
    <div className="space-y-8 pb-4">
      {selectableGroups.map((g) => (
        <section key={g.bucket} aria-label={g.label}>
          <SectionHeader title={`${g.label} (${g.tasks.length})`} description={g.description} />
          <DeadlineTable tasks={g.shown} today={today} bucket={g.bucket} selectedIds={selected} onToggle={toggle} onToggleAll={toggleAll} />
          {g.shown.length < g.tasks.length && (
            <p className="mt-1.5 text-xs text-text-muted">
              Showing {g.shown.length} of {g.tasks.length}. Narrow with the filters above.
            </p>
          )}
        </section>
      ))}

      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <label className="flex items-center gap-1.5 text-xs text-text-secondary">
          Change deadline to
          <Input type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} disabled={applying} className="w-auto py-1" />
        </label>
        <Button size="sm" disabled={applying || !bulkDate} onClick={applyBulkDeadline}>
          {applying ? 'Applying…' : 'Apply'}
        </Button>
      </BulkActionBar>
    </div>
  )
}

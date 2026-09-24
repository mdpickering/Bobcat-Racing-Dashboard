'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import DayDetailPanel from './DayDetailPanel'
import { deadlineDateKey } from '@/lib/deadline'
import type { CalendarEvent, Milestone, Task } from '@/types/database'

interface MonthCalendarProps {
  year: number
  month: number // 0-indexed
  events: CalendarEvent[]
  milestones: Milestone[]
  taskDeadlines: Task[]
  canEditSubsystemIds: Set<string>
  isCtoOrAdmin: boolean
  // Page the month navigation stays on (the Operations view embeds this same calendar).
  basePath?: string
}

function localDateKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function MonthCalendar({ year, month, events, milestones, taskDeadlines, canEditSubsystemIds, isCtoOrAdmin, basePath = '/calendar' }: MonthCalendarProps) {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const { eventsByDay, milestonesByDay, tasksByDay } = useMemo(() => {
    const eByDay = new Map<string, CalendarEvent[]>()
    for (const ev of events) {
      const key = localDateKey(ev.start_time)
      if (!eByDay.has(key)) eByDay.set(key, [])
      eByDay.get(key)!.push(ev)
    }
    const mByDay = new Map<string, Milestone[]>()
    for (const m of milestones) {
      const key = m.date.slice(0, 10)
      if (!mByDay.has(key)) mByDay.set(key, [])
      mByDay.get(key)!.push(m)
    }
    const tByDay = new Map<string, Task[]>()
    for (const t of taskDeadlines) {
      // Deadlines are date-only (see lib/deadline.ts): bucket by their stored calendar
      // date, not the viewer's local date, or they land on the previous day in the US.
      const key = deadlineDateKey(t.deadline)
      if (!key) continue
      if (!tByDay.has(key)) tByDay.set(key, [])
      tByDay.get(key)!.push(t)
    }
    return { eventsByDay: eByDay, milestonesByDay: mByDay, tasksByDay: tByDay }
  }, [events, milestones, taskDeadlines])

  const firstOfMonth = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startWeekday = firstOfMonth.getDay()
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7

  function goToMonth(y: number, m: number) {
    const params = new URLSearchParams()
    params.set('year', String(y))
    params.set('month', String(m + 1))
    router.push(`${basePath}?${params.toString()}`)
  }

  function goPrev() {
    const d = new Date(year, month - 1, 1)
    goToMonth(d.getFullYear(), d.getMonth())
  }

  function goNext() {
    const d = new Date(year, month + 1, 1)
    goToMonth(d.getFullYear(), d.getMonth())
  }

  function goToday() {
    goToMonth(today.getFullYear(), today.getMonth())
  }

  const cells: { date: Date; key: string; inMonth: boolean }[] = []
  for (let i = 0; i < totalCells; i++) {
    const date = new Date(year, month, 1 - startWeekday + i)
    cells.push({
      date,
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      inMonth: date.getMonth() === month,
    })
  }

  return (
    <Panel className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-bold text-text-primary">{firstOfMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={goPrev} aria-label="Previous month">
            <ChevronLeft size={14} />
          </Button>
          <Button size="sm" variant="secondary" onClick={goToday}>
            Today
          </Button>
          <Button size="sm" variant="ghost" onClick={goNext} aria-label="Next month">
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-center text-[10px] font-mono uppercase text-text-muted">
            {w}
          </div>
        ))}
        {cells.map(({ date, key, inMonth }) => {
          const dayEvents = eventsByDay.get(key) ?? []
          const dayMilestones = milestonesByDay.get(key) ?? []
          const dayTasks = tasksByDay.get(key) ?? []
          const total = dayEvents.length + dayMilestones.length + dayTasks.length
          const isToday = key === todayKey

          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedDate(date)}
              className={`flex min-h-[72px] flex-col items-start gap-1 rounded-lg border p-1.5 text-left transition-colors ${
                inMonth ? 'border-border bg-surface hover:bg-surface-raised' : 'border-transparent bg-transparent opacity-40 hover:opacity-70'
              } ${isToday ? 'ring-1 ring-qu-gold' : ''}`}
            >
              <span className={`text-[11px] ${isToday ? 'font-bold text-qu-gold' : 'text-text-secondary'}`}>{date.getDate()}</span>
              <div className="flex w-full flex-wrap gap-0.5">
                {dayMilestones.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-qu-gold" title="Milestone" />}
                {dayEvents.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-accent-blue" title="Event" />}
                {dayTasks.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-rose-400" title="Task deadline" />}
              </div>
              {total > 0 && <span className="text-[9px] text-text-muted">{total} item{total === 1 ? '' : 's'}</span>}
            </button>
          )
        })}
      </div>

      <DayDetailPanel
        open={selectedDate !== null}
        onClose={() => setSelectedDate(null)}
        date={selectedDate}
        events={selectedDate ? eventsByDay.get(`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`) ?? [] : []}
        milestones={selectedDate ? milestonesByDay.get(`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`) ?? [] : []}
        taskDeadlines={selectedDate ? tasksByDay.get(`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`) ?? [] : []}
        canEditSubsystemIds={canEditSubsystemIds}
        isCtoOrAdmin={isCtoOrAdmin}
      />
    </Panel>
  )
}

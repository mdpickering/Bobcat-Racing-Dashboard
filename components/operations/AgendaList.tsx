'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, CalendarDays, Flag, Repeat } from 'lucide-react'
import { addDaysToKey } from '@/lib/operationsSchedule'
import { todayDateKey } from '@/lib/deadline'
import type { AgendaItem, AgendaKind } from '@/lib/operationsSchedule'

const pad = (n: number) => String(n).padStart(2, '0')
const localKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const KIND: Record<AgendaKind, { icon: typeof CalendarDays; label: string }> = {
  event: { icon: CalendarDays, label: 'Event' },
  deadline: { icon: CalendarClock, label: 'Deadline' },
  milestone: { icon: Flag, label: 'Milestone' },
  recurring: { icon: Repeat, label: 'Weekly' },
}

export function dayHeading(key: string, today: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const text = date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })
  if (key === today) return `Today · ${text}`
  if (key === addDaysToKey(today, 1)) return `Tomorrow · ${text}`
  return text
}

// the weekday (0 = Sunday) of a 'YYYY-MM-DD' key
const weekdayOf = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

interface AgendaListProps {
  items: AgendaItem[]
  // how many days from today the list covers (today is day 1)
  days: number
  emptyTitle: string
  emptyText: string
}

// A day-by-day view of what is happening. It groups by the VIEWER'S own calendar dates, in the browser, so an evening
// event lands on the right day; deadlines and milestones are date-only and use their stored date, as everywhere else.
// Weekly recurring events (already supported by the calendar) repeat on their weekday.
export default function AgendaList({ items, days, emptyTitle, emptyText }: AgendaListProps) {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])

  if (!ready) return <div className="h-24 animate-pulse rounded-xl border border-border bg-surface" aria-hidden="true" />

  const today = todayDateKey()
  const last = addDaysToKey(today, days - 1)
  const byDay = new Map<string, { sortKey: string; item: AgendaItem }[]>()
  const add = (key: string, sortKey: string, item: AgendaItem) => byDay.set(key, [...(byDay.get(key) ?? []), { sortKey, item }])

  for (const item of items) {
    if (item.kind === 'recurring') {
      for (let i = 0; i < days; i++) {
        const key = addDaysToKey(today, i)
        if (weekdayOf(key) === item.weekday) add(key, `${key}T23:59:00`, item)
      }
      continue
    }
    const key = item.kind === 'event' ? localKey(new Date(item.start as string)) : (item.dateKey as string)
    if (key < today || key > last) continue
    add(key, item.kind === 'event' ? (item.start as string) : `${key}T00:00:00`, item)
  }
  const dayKeys = [...byDay.keys()].sort()

  if (dayKeys.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface px-4 py-6 text-center">
        <p className="text-xs font-medium text-text-secondary">{emptyTitle}</p>
        <p className="mt-1 text-xs text-text-muted">{emptyText}</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {dayKeys.map((key) => (
        <section key={key} aria-label={dayHeading(key, today)} className="px-4 py-3">
          <h3 className={`text-xs font-semibold ${key === today ? 'text-ws' : 'text-text-primary'}`}>{dayHeading(key, today)}</h3>
          <ul className="mt-2 space-y-1.5">
            {byDay
              .get(key)!
              .sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1))
              .map(({ item }) => {
                const K = KIND[item.kind]
                const Icon = K.icon
                const time =
                  item.kind === 'event'
                    ? new Date(item.start as string).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                    : item.kind === 'recurring'
                      ? item.timeLabel || 'Weekly'
                      : 'All day'
                const title = item.href ? (
                  <Link href={item.href} className="font-medium text-text-primary hover:text-accent-blue">
                    {item.title}
                  </Link>
                ) : (
                  <span className="font-medium text-text-primary">{item.title}</span>
                )
                return (
                  <li key={`${item.kind}-${item.id}-${key}`} className="flex items-start gap-3 text-xs">
                    <span className="w-20 flex-shrink-0 pt-0.5 tabular-nums text-text-muted">{time}</span>
                    <Icon size={14} className={`mt-0.5 flex-shrink-0 ${item.kind === 'deadline' ? 'text-status-warning' : 'text-text-muted'}`} aria-hidden="true" />
                    <span className="min-w-0">
                      {title}
                      <span className="block text-text-muted">
                        {K.label}
                        {item.team ? ` · ${item.team}` : item.kind === 'event' || item.kind === 'recurring' ? ' · Team-wide' : ''}
                      </span>
                    </span>
                  </li>
                )
              })}
          </ul>
        </section>
      ))}
    </div>
  )
}

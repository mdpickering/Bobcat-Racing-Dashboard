'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import type { CalendarEvent } from '@/types/database'

const pad = (n: number) => String(n).padStart(2, '0')
const localKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

interface EventsListProps {
  events: CalendarEvent[]
  order: 'asc' | 'desc'
  emptyTitle: string
  emptyDescription: string
}

// Events grouped by the viewer's own calendar dates (this runs in the browser so an evening meeting lands on the right
// day). Times are real timestamps; nothing here changes an event or adds a new event model.
export default function EventsList({ events, order, emptyTitle, emptyDescription }: EventsListProps) {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])

  if (!ready) return <div className="h-24 animate-pulse rounded-xl border border-border bg-surface" aria-hidden="true" />
  if (events.length === 0) return <EmptyState icon={CalendarDays} title={emptyTitle} description={emptyDescription} />

  const byDay = new Map<string, CalendarEvent[]>()
  for (const e of events) {
    const key = localKey(new Date(e.start_time))
    byDay.set(key, [...(byDay.get(key) ?? []), e])
  }
  const keys = [...byDay.keys()].sort()
  if (order === 'desc') keys.reverse()
  const today = localKey(new Date())

  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {keys.map((key) => {
        const [y, m, d] = key.split('-').map(Number)
        const heading = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
        const items = byDay.get(key)!.sort((a, b) => (a.start_time < b.start_time ? -1 : 1))
        return (
          <section key={key} aria-label={heading} className="px-4 py-3">
            <h3 className={`text-xs font-semibold ${key === today ? 'text-ws' : 'text-text-primary'}`}>
              {key === today ? 'Today · ' : ''}
              {heading}
            </h3>
            <ul className="mt-2 space-y-2">
              {items.map((e) => (
                <li key={e.id} className="flex items-start gap-3 text-xs">
                  <span className="w-28 flex-shrink-0 pt-0.5 tabular-nums text-text-muted">
                    {timeOf(e.start_time)} – {timeOf(e.end_time)}
                  </span>
                  <span className="min-w-0">
                    <Link href={`/calendar?year=${y}&month=${m}`} className="font-medium text-text-primary hover:text-accent-blue">
                      {e.title}
                    </Link>
                    <span className="block text-text-muted">{e.subsystem?.name ?? 'Team-wide'}</span>
                    {e.description && <span className="mt-0.5 block max-w-2xl truncate text-text-secondary">{e.description}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

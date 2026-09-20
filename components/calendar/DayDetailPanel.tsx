'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Pencil, Archive, Check, X, Clock, Flag, ListChecks } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { updateCalendarEvent, updateMilestone } from '@/lib/supabase/queries/calendar'
import { formatDateTime, formatDate } from '@/lib/format'
import { isDeadlineOverdue } from '@/lib/deadline'
import type { CalendarEvent, Milestone, Task } from '@/types/database'

interface DayDetailPanelProps {
  open: boolean
  onClose: () => void
  date: Date | null
  events: CalendarEvent[]
  milestones: Milestone[]
  taskDeadlines: Task[]
  canEditSubsystemIds: Set<string>
  isCtoOrAdmin: boolean
}

function canEditItem(subsystemId: string | null, canEditSubsystemIds: Set<string>, isCtoOrAdmin: boolean) {
  if (isCtoOrAdmin) return true
  return !!subsystemId && canEditSubsystemIds.has(subsystemId)
}

export default function DayDetailPanel({ open, onClose, date, events, milestones, taskDeadlines, canEditSubsystemIds, isCtoOrAdmin }: DayDetailPanelProps) {
  const router = useRouter()
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [eventTitle, setEventTitle] = useState('')
  const [eventDescription, setEventDescription] = useState('')
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null)
  const [milestoneName, setMilestoneName] = useState('')
  const [milestoneDescription, setMilestoneDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!date) return null

  async function handleArchiveEvent(id: string) {
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await updateCalendarEvent(supabase, id, { active: false })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not archive event.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveEvent(id: string) {
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await updateCalendarEvent(supabase, id, { title: eventTitle, description: eventDescription || null })
      setEditingEventId(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save event.')
    } finally {
      setBusy(false)
    }
  }

  async function handleArchiveMilestone(id: string) {
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await updateMilestone(supabase, id, { active: false })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not archive milestone.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveMilestone(id: string) {
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await updateMilestone(supabase, id, { name: milestoneName, description: milestoneDescription || null })
      setEditingMilestoneId(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save milestone.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} maxWidthClassName="max-w-lg">
      <div className="space-y-4 text-xs">
        {error && <p className="text-rose-400">{error}</p>}

        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-mono uppercase text-text-muted">
            <Clock size={11} /> Events
          </h4>
          {events.length === 0 ? (
            <p className="text-text-muted">No events.</p>
          ) : (
            <ul className="space-y-2">
              {events.map((ev) => {
                const editable = canEditItem(ev.subsystem_id, canEditSubsystemIds, isCtoOrAdmin)
                return (
                  <li key={ev.id} className="rounded-lg border border-border p-2.5">
                    {editingEventId === ev.id ? (
                      <div className="space-y-2">
                        <Input value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} />
                        <Textarea rows={2} value={eventDescription} onChange={(e) => setEventDescription(e.target.value)} placeholder="Description" />
                        <div className="flex gap-2">
                          <Button size="sm" disabled={busy} onClick={() => handleSaveEvent(ev.id)}>
                            <Check size={11} /> Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingEventId(null)}>
                            <X size={11} /> Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-text-primary">{ev.title}</span>
                          {editable && (
                            <div className="flex flex-shrink-0 gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingEventId(ev.id)
                                  setEventTitle(ev.title)
                                  setEventDescription(ev.description ?? '')
                                }}
                                className="text-text-muted hover:text-accent-blue"
                              >
                                <Pencil size={12} />
                              </button>
                              <button type="button" disabled={busy} onClick={() => handleArchiveEvent(ev.id)} className="text-text-muted hover:text-rose-400">
                                <Archive size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                        <p className="mt-0.5 text-[10px] text-text-muted">
                          {formatDateTime(ev.start_time)} – {formatDateTime(ev.end_time)}
                          {ev.subsystem?.name ? ` · ${ev.subsystem.name}` : ' · Team-wide'}
                        </p>
                        {ev.description && <p className="mt-1 whitespace-pre-wrap text-text-secondary">{ev.description}</p>}
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-mono uppercase text-text-muted">
            <Flag size={11} /> Milestones
          </h4>
          {milestones.length === 0 ? (
            <p className="text-text-muted">No milestones.</p>
          ) : (
            <ul className="space-y-2">
              {milestones.map((m) => {
                const editable = canEditItem(m.subsystem_id, canEditSubsystemIds, isCtoOrAdmin)
                return (
                  <li key={m.id} className="rounded-lg border border-qu-gold/20 bg-qu-gold/5 p-2.5">
                    {editingMilestoneId === m.id ? (
                      <div className="space-y-2">
                        <Input value={milestoneName} onChange={(e) => setMilestoneName(e.target.value)} />
                        <Textarea rows={2} value={milestoneDescription} onChange={(e) => setMilestoneDescription(e.target.value)} placeholder="Description" />
                        <div className="flex gap-2">
                          <Button size="sm" disabled={busy} onClick={() => handleSaveMilestone(m.id)}>
                            <Check size={11} /> Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingMilestoneId(null)}>
                            <X size={11} /> Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-text-primary">{m.name}</span>
                          {editable && (
                            <div className="flex flex-shrink-0 gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMilestoneId(m.id)
                                  setMilestoneName(m.name)
                                  setMilestoneDescription(m.description ?? '')
                                }}
                                className="text-text-muted hover:text-accent-blue"
                              >
                                <Pencil size={12} />
                              </button>
                              <button type="button" disabled={busy} onClick={() => handleArchiveMilestone(m.id)} className="text-text-muted hover:text-rose-400">
                                <Archive size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                        <p className="mt-0.5 text-[10px] text-text-muted">{formatDate(m.date)}{m.subsystem?.name ? ` · ${m.subsystem.name}` : ' · Team-wide'}</p>
                        {m.description && <p className="mt-1 whitespace-pre-wrap text-text-secondary">{m.description}</p>}
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-mono uppercase text-text-muted">
            <ListChecks size={11} /> Task Deadlines
          </h4>
          {taskDeadlines.length === 0 ? (
            <p className="text-text-muted">No task deadlines.</p>
          ) : (
            <ul className="space-y-1.5">
              {taskDeadlines.map((t) => (
                <li key={t.id}>
                  <Link href={`/tasks/${t.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 hover:bg-surface-raised">
                    <span className={isDeadlineOverdue(t.deadline, t.status) ? 'font-medium text-rose-400' : 'text-text-primary'}>{t.title}</span>
                    <Badge tone="slate">{t.subsystem?.name}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}

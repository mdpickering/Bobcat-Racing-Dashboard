'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Panel from '@/components/ui/Panel'
import { createClient } from '@/lib/supabase/client'
import { setTimelineMilestoneText } from '@/lib/supabase/queries/timeline'
import type { Subsystem, TimelineColumn, TimelineMilestone } from '@/types/database'

interface TimelineGridProps {
  columns: TimelineColumn[]
  subsystems: Subsystem[]
  milestones: TimelineMilestone[]
  canEditSubsystemIds: Set<string>
  isCtoOrAdmin: boolean
}

export default function TimelineGrid({ columns, subsystems, milestones, canEditSubsystemIds, isCtoOrAdmin }: TimelineGridProps) {
  const router = useRouter()
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busyCell, setBusyCell] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cellMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of milestones) {
      map.set(`${m.subsystem_id}::${m.timeline_column_key}`, m.milestone_text ?? '')
    }
    return map
  }, [milestones])

  function canEdit(subsystemId: string) {
    return isCtoOrAdmin || canEditSubsystemIds.has(subsystemId)
  }

  async function handleSave(subsystemId: string, columnKey: string) {
    const cellKey = `${subsystemId}::${columnKey}`
    setBusyCell(cellKey)
    setError(null)
    try {
      const supabase = createClient()
      await setTimelineMilestoneText(supabase, subsystemId, columnKey, draft)
      setEditingCell(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this cell.')
    } finally {
      setBusyCell(null)
    }
  }

  if (columns.length === 0) {
    return (
      <Panel className="p-6 text-center text-xs text-text-muted">
        No timeline columns configured yet.
      </Panel>
    )
  }

  return (
    <Panel className="overflow-x-auto p-0">
      {error && <p className="p-3 text-xs text-rose-400">{error}</p>}
      <table className="w-full min-w-[900px] border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-surface p-2.5 text-left text-[10px] font-mono uppercase text-text-muted">Subsystem</th>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`min-w-[110px] border-l border-border p-2.5 text-left text-[10px] font-mono uppercase ${col.highlight ? 'bg-qu-gold/10 text-qu-gold' : 'text-text-muted'}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {subsystems.map((sub) => {
            const editable = canEdit(sub.id)
            return (
              <tr key={sub.id}>
                <td className="sticky left-0 z-10 whitespace-nowrap bg-surface p-2.5 font-medium text-text-primary">{sub.name}</td>
                {columns.map((col) => {
                  const cellKey = `${sub.id}::${col.key}`
                  const value = cellMap.get(cellKey) ?? ''
                  const isEditing = editingCell === cellKey
                  return (
                    <td key={col.key} className={`border-l border-border p-1.5 align-top ${col.highlight ? 'bg-qu-gold/5' : ''}`}>
                      {isEditing ? (
                        <textarea
                          autoFocus
                          rows={2}
                          value={draft}
                          disabled={busyCell === cellKey}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => handleSave(sub.id, col.key)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditingCell(null)
                          }}
                          className="w-full rounded-md border border-accent-blue bg-surface px-1.5 py-1 text-[11px] text-text-primary outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() => {
                            setEditingCell(cellKey)
                            setDraft(value)
                          }}
                          className={`min-h-[32px] w-full rounded-md px-1.5 py-1 text-left text-[11px] ${
                            editable ? 'hover:bg-surface-raised' : 'cursor-default'
                          } ${value ? 'text-text-primary' : 'text-text-muted'}`}
                        >
                          {value || (editable ? '—' : '')}
                        </button>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </Panel>
  )
}

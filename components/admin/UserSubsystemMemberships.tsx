'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Star, X, UserPlus } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { createClient } from '@/lib/supabase/client'
import { addSubsystemMember, setSubsystemMemberLead, removeSubsystemMember } from '@/lib/supabase/queries/subsystems'
import type { Subsystem, SubsystemMember } from '@/types/database'
import { Boxes } from 'lucide-react'

interface UserSubsystemMembershipsProps {
  userId: string
  memberships: SubsystemMember[]
  allSubsystems: Subsystem[]
}

export default function UserSubsystemMemberships({ userId, memberships, allSubsystems }: UserSubsystemMembershipsProps) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState('')
  const [asLead, setAsLead] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const memberSubsystemIds = new Set(memberships.map((m) => m.subsystem_id))
  const available = allSubsystems.filter((s) => !memberSubsystemIds.has(s.id))

  async function handleAdd() {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await addSubsystemMember(supabase, selected, userId, asLead)
      setSelected('')
      setAsLead(false)
      setAdding(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add membership.')
    } finally {
      setBusy(false)
    }
  }

  async function handleToggleLead(subsystemId: string, isLead: boolean) {
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await setSubsystemMemberLead(supabase, subsystemId, userId, !isLead)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update lead status.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(subsystemId: string) {
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await removeSubsystemMember(supabase, subsystemId, userId)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove membership.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wide text-text-primary">Subsystem Memberships</h3>
        {!adding && available.length > 0 && (
          <button type="button" onClick={() => setAdding(true)} className="text-[10px] font-mono uppercase text-accent-blue hover:underline">
            <UserPlus size={11} className="mr-0.5 inline" /> Add
          </button>
        )}
      </div>

      {error && <p className="mb-2 text-[11px] text-rose-400">{error}</p>}

      {memberships.length === 0 && !adding ? (
        <EmptyState icon={Boxes} title="Not a member of any subsystem" />
      ) : (
        <ul className="space-y-1.5">
          {memberships.map((m) => (
            <li key={m.subsystem_id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-2 text-xs">
              <span className="truncate text-text-primary">{m.subsystem?.name ?? m.subsystem_id}</span>
              <div className="flex flex-shrink-0 items-center gap-2">
                {m.is_lead && <Badge tone="gold">Lead</Badge>}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleToggleLead(m.subsystem_id, m.is_lead)}
                  title={m.is_lead ? 'Remove lead' : 'Make lead'}
                  className={m.is_lead ? 'text-qu-gold' : 'text-text-muted hover:text-qu-gold'}
                >
                  <Star size={13} />
                </button>
                <button type="button" disabled={busy} onClick={() => handleRemove(m.subsystem_id)} className="text-text-muted hover:text-rose-400">
                  <X size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Select value={selected} onChange={(e) => setSelected(e.target.value)} className="flex-1">
            <option value="">Select a subsystem…</option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-1.5 text-[10px] text-text-muted">
            <input type="checkbox" checked={asLead} onChange={(e) => setAsLead(e.target.checked)} /> As lead
          </label>
          <Button size="sm" disabled={!selected || busy} onClick={handleAdd}>
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </div>
      )}
    </Panel>
  )
}

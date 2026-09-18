'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Users, UserPlus, Star, X } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Avatar from '@/components/ui/Avatar'
import EmptyState from '@/components/ui/EmptyState'
import { createClient } from '@/lib/supabase/client'
import { addSubsystemMember, setSubsystemMemberLead, removeSubsystemMember } from '@/lib/supabase/queries/subsystems'
import type { SubsystemMember } from '@/types/database'
import type { Profile } from '@/types/user'

interface SubsystemMembersPanelProps {
  subsystemId: string
  members: SubsystemMember[]
  candidateProfiles: Profile[]
  canManage: boolean
}

export default function SubsystemMembersPanel({ subsystemId, members, candidateProfiles, canManage }: SubsystemMembersPanelProps) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const memberIds = new Set(members.map((m) => m.user_id))
  const available = candidateProfiles.filter((p) => !memberIds.has(p.id))

  async function handleAdd() {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await addSubsystemMember(supabase, subsystemId, selected)
      setSelected('')
      setAdding(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add member.')
    } finally {
      setBusy(false)
    }
  }

  async function handleToggleLead(userId: string, isLead: boolean) {
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

  async function handleRemove(userId: string) {
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await removeSubsystemMember(supabase, subsystemId, userId)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove member.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Users size={13} className="text-accent-blue" />
          <h2 className="text-xs font-bold uppercase tracking-wide text-text-primary">Members ({members.length})</h2>
        </div>
        {canManage && !adding && available.length > 0 && (
          <button type="button" onClick={() => setAdding(true)} className="text-[10px] font-mono uppercase text-accent-blue hover:underline">
            <UserPlus size={11} className="mr-0.5 inline" /> Add
          </button>
        )}
      </div>

      {error && <p className="mb-2 text-[11px] text-rose-400">{error}</p>}

      {members.length === 0 ? (
        <EmptyState title="No members yet" />
      ) : (
        <ul className="space-y-1.5">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs">
              {/* Only cto/admin can reach the admin user-detail page — a lead viewing their
                  own subsystem's roster has no route to link to, so their row stays plain text. */}
              {canManage ? (
                <Link href={`/admin/users/${m.user_id}`} className="flex min-w-0 items-center gap-2 hover:text-accent-blue">
                  <Avatar name={m.profile?.display_name || m.profile?.email} src={m.profile?.avatar_url} size={22} />
                  <span className="truncate">{m.profile?.display_name || m.profile?.email}</span>
                </Link>
              ) : (
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar name={m.profile?.display_name || m.profile?.email} src={m.profile?.avatar_url} size={22} />
                  <span className="truncate">{m.profile?.display_name || m.profile?.email}</span>
                </span>
              )}
              <div className="flex flex-shrink-0 items-center gap-2">
                {m.is_lead && <Badge tone="gold">Lead</Badge>}
                {canManage && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleToggleLead(m.user_id, m.is_lead)}
                      title={m.is_lead ? 'Remove lead' : 'Make lead'}
                      className={m.is_lead ? 'text-qu-gold' : 'text-text-muted hover:text-qu-gold'}
                    >
                      <Star size={13} />
                    </button>
                    <button type="button" disabled={busy} onClick={() => handleRemove(m.user_id)} className="text-text-muted hover:text-rose-400">
                      <X size={13} />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canManage && adding && (
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          <Select value={selected} onChange={(e) => setSelected(e.target.value)} className="flex-1">
            <option value="">Select an approved member…</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name || p.email}
              </option>
            ))}
          </Select>
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

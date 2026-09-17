'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, X, Star } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import { createClient } from '@/lib/supabase/client'
import { setTaskAssignee, removeTaskAssignee } from '@/lib/supabase/queries/tasks'
import type { TaskAssignee, SubsystemMember } from '@/types/database'

interface TaskAssigneesPanelProps {
  taskId: string
  assignees: TaskAssignee[]
  subsystemMembers: SubsystemMember[]
  canManage: boolean
}

export default function TaskAssigneesPanel({ taskId, assignees, subsystemMembers, canManage }: TaskAssigneesPanelProps) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const primary = assignees.find((a) => a.role === 'primary')
  const coOwners = assignees.filter((a) => a.role === 'co_owner')
  const assignedIds = new Set(assignees.map((a) => a.user_id))
  const available = subsystemMembers.filter((m) => !assignedIds.has(m.user_id))

  async function handleSetPrimary(userId: string) {
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      // Only one primary owner is allowed per task (enforced by a DB
      // unique index) — the current primary must be demoted first, or
      // promoting a new one violates that constraint.
      if (primary && primary.user_id !== userId) {
        await setTaskAssignee(supabase, taskId, primary.user_id, 'co_owner')
      }
      await setTaskAssignee(supabase, taskId, userId, 'primary')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update owner.')
    } finally {
      setBusy(false)
    }
  }

  async function handleAddCoOwner() {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await setTaskAssignee(supabase, taskId, selected, primary ? 'co_owner' : 'primary')
      setSelected('')
      setAdding(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add assignee.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(userId: string) {
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await removeTaskAssignee(supabase, taskId, userId)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove assignee.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wide text-text-primary">Owners</h3>
        {canManage && !adding && available.length > 0 && (
          <button type="button" onClick={() => setAdding(true)} className="text-[10px] font-mono uppercase text-accent-blue hover:underline">
            <UserPlus size={11} className="mr-0.5 inline" /> Add
          </button>
        )}
      </div>

      {error && <p className="mb-2 text-[11px] text-rose-400">{error}</p>}

      <div className="space-y-2">
        {primary ? (
          <div className="flex items-center gap-2 rounded-lg border border-qu-gold/20 bg-qu-gold/5 px-2.5 py-2">
            <Avatar name={primary.profile?.display_name || primary.profile?.email} src={primary.profile?.avatar_url} size={26} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-text-primary">{primary.profile?.display_name || primary.profile?.email}</div>
              <div className="flex items-center gap-1 text-[10px] text-qu-gold">
                <Star size={9} /> Primary owner
              </div>
            </div>
            {canManage && (
              <button type="button" disabled={busy} onClick={() => handleRemove(primary.user_id)} className="text-text-muted hover:text-rose-400">
                <X size={13} />
              </button>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-text-muted">No primary owner assigned.</p>
        )}

        {coOwners.map((a) => (
          <div key={a.user_id} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2">
            <Avatar name={a.profile?.display_name || a.profile?.email} src={a.profile?.avatar_url} size={26} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-text-primary">{a.profile?.display_name || a.profile?.email}</div>
              <div className="text-[10px] text-text-muted">Co-owner</div>
            </div>
            {canManage && (
              <div className="flex items-center gap-2">
                <button type="button" disabled={busy} onClick={() => handleSetPrimary(a.user_id)} title="Make primary" className="text-text-muted hover:text-qu-gold">
                  <Star size={13} />
                </button>
                <button type="button" disabled={busy} onClick={() => handleRemove(a.user_id)} className="text-text-muted hover:text-rose-400">
                  <X size={13} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {canManage && adding && (
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          <Select value={selected} onChange={(e) => setSelected(e.target.value)} className="flex-1">
            <option value="">Select a subsystem member…</option>
            {available.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.profile?.display_name || m.profile?.email}
              </option>
            ))}
          </Select>
          <Button size="sm" disabled={!selected || busy} onClick={handleAddCoOwner}>
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

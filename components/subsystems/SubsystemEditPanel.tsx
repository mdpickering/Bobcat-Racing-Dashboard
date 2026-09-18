'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X, Archive, RotateCcw } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { createClient } from '@/lib/supabase/client'
import { updateSubsystem } from '@/lib/supabase/queries/subsystems'
import type { Subsystem, SubsystemMember } from '@/types/database'
import Avatar from '@/components/ui/Avatar'

export default function SubsystemEditPanel({ subsystem, leads }: { subsystem: Subsystem; leads: SubsystemMember[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(subsystem.name)
  const [description, setDescription] = useState(subsystem.description ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function persist(patch: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await updateSubsystem(supabase, subsystem.id, patch)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSave() {
    await persist({ name, description: description || null })
    setEditing(false)
  }

  async function handleArchiveToggle() {
    await persist({ active: !subsystem.active })
  }

  return (
    <Panel className="p-5">
      {error && <p className="mb-2 text-xs text-rose-400">{error}</p>}

      {editing ? (
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="text-sm font-bold" />
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={handleSave}>
              <Check size={12} /> Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              <X size={12} /> Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-text-primary">{subsystem.name}</h1>
              {!subsystem.active && <Badge tone="rose">Archived</Badge>}
            </div>
            <div className="flex flex-shrink-0 gap-2">
              <button type="button" onClick={() => setEditing(true)} className="text-text-muted hover:text-accent-blue">
                <Pencil size={14} />
              </button>
              <button type="button" disabled={busy} onClick={handleArchiveToggle} className="text-text-muted hover:text-rose-400" title={subsystem.active ? 'Archive' : 'Restore'}>
                {subsystem.active ? <Archive size={14} /> : <RotateCcw size={14} />}
              </button>
            </div>
          </div>
          {subsystem.description && <p className="mt-2 text-xs text-text-secondary">{subsystem.description}</p>}
        </>
      )}

      {leads.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-mono uppercase text-text-muted">Led by</span>
          {leads.map((l) => (
            <span key={l.user_id} className="flex items-center gap-1.5 rounded-full border border-qu-gold/30 bg-qu-gold/10 px-2 py-0.5 text-[11px] text-qu-gold">
              <Avatar name={l.profile?.display_name || l.profile?.email} src={l.profile?.avatar_url} size={16} />
              {l.profile?.display_name || l.profile?.email}
            </span>
          ))}
        </div>
      )}
    </Panel>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { History } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Textarea from '@/components/ui/Textarea'
import Badge from '@/components/ui/Badge'
import { createClient } from '@/lib/supabase/client'
import { addSponsorshipNote } from '@/lib/supabase/queries/sponsorships'
import { getErrorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import type { SponsorshipHistoryEntry } from '@/types/database'

const KIND_LABEL: Record<SponsorshipHistoryEntry['kind'], string> = {
  note: 'Note',
  stage_change: 'Stage',
  level_decision: 'Level',
  contribution: 'Contribution',
  payment: 'Payment',
  availability: 'Availability',
  deliverable: 'Deliverable',
}

// The append-only log of everything that happened to this sponsorship: notes people wrote plus system events the
// database records itself (stage changes, level decisions, contributions, payments). Nothing here can be edited.
export default function HistoryPanel({ sponsorshipId, history, canManage }: { sponsorshipId: string; history: SponsorshipHistoryEntry[]; canManage: boolean }) {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!note.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await addSponsorshipNote(createClient(), sponsorshipId, note)
      setNote('')
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not add the note.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel className="p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-text-primary">
        <History size={13} className="text-accent-blue" /> Sponsorship history
      </h2>
      {canManage && (
        <form onSubmit={handleAdd} className="mb-4 space-y-2">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (call, email, agreement…)" disabled={busy} />
          <div className="flex items-center justify-between gap-2">
            {error ? <p className="text-xs text-status-danger">{error}</p> : <span className="text-[11px] text-text-muted">Notes are permanent.</span>}
            <Button size="sm" type="submit" disabled={busy || !note.trim()}>
              {busy ? 'Adding…' : 'Add note'}
            </Button>
          </div>
        </form>
      )}
      {history.length === 0 ? (
        <p className="text-[12px] text-text-muted">Nothing has happened yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {history.map((h) => (
            <li key={h.id} className="py-2 text-xs first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={h.kind === 'note' ? 'sky' : 'slate'}>{KIND_LABEL[h.kind]}</Badge>
                <span className="whitespace-pre-wrap text-text-primary">{h.body}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-text-muted">
                {formatDateTime(h.created_at)}
                {h.author ? ` · ${h.author.display_name || h.author.email}` : ' · system'}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

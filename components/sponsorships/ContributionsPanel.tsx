'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Coins, Plus } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import Badge from '@/components/ui/Badge'
import { createClient } from '@/lib/supabase/client'
import { addContribution, setContributionWithdrawn } from '@/lib/supabase/queries/sponsorships'
import { getErrorMessage } from '@/lib/errors'
import { IN_KIND_TYPE_LABEL, formatContributionDate, formatMoney } from '@/lib/sponsorships'
import type { ContributionKind, InKindType, SponsorshipContribution } from '@/types/database'

interface ContributionsPanelProps {
  sponsorshipId: string
  contributions: SponsorshipContribution[]
  canManage: boolean
}

function ContributionRow({ c, canManage, onToggle, busy }: { c: SponsorshipContribution; canManage: boolean; onToggle: (c: SponsorshipContribution) => void; busy: boolean }) {
  const amount = c.kind === 'cash' ? c.committed_amount : c.estimated_value
  return (
    <li className={`flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0 ${c.withdrawn ? 'opacity-60' : ''}`}>
      <div className="min-w-0 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-semibold tabular-nums text-text-primary ${c.withdrawn ? 'line-through' : ''}`}>{formatMoney(amount)}</span>
          {c.kind === 'in_kind' && c.in_kind_type && <Badge tone="sky">{IN_KIND_TYPE_LABEL[c.in_kind_type]}</Badge>}
          {c.withdrawn && <Badge tone="rose">Withdrawn</Badge>}
        </div>
        <div className="mt-0.5 text-[10px] text-text-muted">
          {c.description ? `${c.description} · ` : ''}
          {c.kind === 'cash' ? 'Committed' : 'Contributed'} {formatContributionDate(c.contributed_on, c.contributed_on_precision)}
          {c.kind === 'in_kind' && c.received_on ? ` · Received ${formatContributionDate(c.received_on, c.received_on_precision)}` : ''}
        </div>
        {c.notes && <div className="mt-0.5 text-[10px] text-text-muted">{c.notes}</div>}
      </div>
      {canManage && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onToggle(c)}>
          {c.withdrawn ? 'Restore' : 'Withdraw'}
        </Button>
      )}
    </li>
  )
}

// Cash and in-kind are kept apart everywhere: cash has payments against it, in-kind has an estimated value and a type.
export default function ContributionsPanel({ sponsorshipId, contributions, canManage }: ContributionsPanelProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<ContributionKind>('cash')
  const [amount, setAmount] = useState('')
  const [inKindType, setInKindType] = useState<InKindType>('components_products')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [received, setReceived] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toggling, setToggling] = useState(false)

  const cash = contributions.filter((c) => c.kind === 'cash')
  const inKind = contributions.filter((c) => c.kind === 'in_kind')
  const parsed = Number(amount)
  const valid = Number.isFinite(parsed) && parsed > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      await addContribution(createClient(), {
        sponsorship_id: sponsorshipId,
        kind,
        description: description.trim() || null,
        committed_amount: kind === 'cash' ? parsed : null,
        estimated_value: kind === 'in_kind' ? parsed : null,
        in_kind_type: kind === 'in_kind' ? inKindType : null,
        contributed_on: date || null,
        received_on: kind === 'in_kind' ? received || null : null,
        notes: notes.trim() || null,
      })
      setOpen(false)
      setAmount('')
      setDescription('')
      setDate('')
      setReceived('')
      setNotes('')
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not add this contribution.'))
    } finally {
      setBusy(false)
    }
  }

  async function handleToggle(c: SponsorshipContribution) {
    setToggling(true)
    setError(null)
    try {
      await setContributionWithdrawn(createClient(), c.id, !c.withdrawn)
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update this contribution.'))
    } finally {
      setToggling(false)
    }
  }

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-text-primary">
          <Coins size={13} className="text-accent-blue" /> Contributions
        </h2>
        {canManage && (
          <Button size="sm" variant="secondary" onClick={() => { setError(null); setOpen(true) }}>
            <Plus size={12} /> Add contribution
          </Button>
        )}
      </div>
      {error && !open && <p className="mb-2 text-xs text-rose-400">{error}</p>}

      {contributions.length === 0 ? (
        <p className="text-[11px] text-text-muted">No contributions recorded yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <div className="mb-1.5 font-mono text-[10px] uppercase text-text-muted">Cash</div>
            {cash.length === 0 ? <p className="text-[11px] text-text-muted">None</p> : <ul className="divide-y divide-border">{cash.map((c) => <ContributionRow key={c.id} c={c} canManage={canManage} onToggle={handleToggle} busy={toggling} />)}</ul>}
          </div>
          <div>
            <div className="mb-1.5 font-mono text-[10px] uppercase text-text-muted">In-kind (estimated value)</div>
            {inKind.length === 0 ? <p className="text-[11px] text-text-muted">None</p> : <ul className="divide-y divide-border">{inKind.map((c) => <ContributionRow key={c.id} c={c} canManage={canManage} onToggle={handleToggle} busy={toggling} />)}</ul>}
          </div>
        </div>
      )}

      <Modal open={open} onClose={busy ? () => {} : () => setOpen(false)} title="Add a contribution" maxWidthClassName="max-w-md">
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Kind</label>
              <Select value={kind} onChange={(e) => setKind(e.target.value as ContributionKind)} disabled={busy}>
                <option value="cash">Cash</option>
                <option value="in_kind">In-kind</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">{kind === 'cash' ? 'Committed amount ($)' : 'Estimated value ($)'}</label>
              <Input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} autoFocus />
            </div>
          </div>
          {kind === 'in_kind' && (
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">In-kind type</label>
              <Select value={inKindType} onChange={(e) => setInKindType(e.target.value as InKindType)} disabled={busy}>
                {(Object.keys(IN_KIND_TYPE_LABEL) as InKindType[]).map((t) => (
                  <option key={t} value={t}>
                    {IN_KIND_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Description (optional)</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} placeholder={kind === 'cash' ? 'e.g. Season gift' : 'e.g. 10% metal discount'} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">{kind === 'cash' ? 'Committed on' : 'Contributed on'}</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={busy} />
            </div>
            {kind === 'in_kind' && (
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Received on</label>
                <Input type="date" value={received} onChange={(e) => setReceived(e.target.value)} disabled={busy} />
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Notes (optional)</label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy} />
          </div>
          {kind === 'cash' && <p className="text-[11px] text-text-muted">Cash received is recorded separately, as payments, once the money arrives.</p>}
          {error && <p className="text-rose-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !valid}>
              {busy ? 'Adding…' : 'Add contribution'}
            </Button>
          </div>
        </form>
      </Modal>
    </Panel>
  )
}

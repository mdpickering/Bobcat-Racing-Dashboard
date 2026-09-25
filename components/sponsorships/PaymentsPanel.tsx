'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Landmark, Plus } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import Badge from '@/components/ui/Badge'
import { createClient } from '@/lib/supabase/client'
import { markPaymentAvailable, recordPayment } from '@/lib/supabase/queries/sponsorships'
import { getErrorMessage } from '@/lib/errors'
import { AVAILABILITY_LABEL, AVAILABILITY_TONE, PAYMENT_METHOD_LABEL, RECEIVED_BY_LABEL, formatContributionDate, formatMoney } from '@/lib/sponsorships'
import type { PaymentAvailability, PaymentEntryType, PaymentMethod, PaymentReceivedBy, SponsorshipContribution, SponsorshipPayment } from '@/types/database'

interface PaymentsPanelProps {
  contributions: SponsorshipContribution[]
  payments: SponsorshipPayment[]
  canManage: boolean
}

const today = () => new Date().toISOString().slice(0, 10)
const nameOf = (p: { display_name: string | null; email: string | null } | null | undefined) => p?.display_name || p?.email || null

// The payment ledger is append-only: entries are never edited or deleted. A mistake is corrected with a refund and a
// new payment. The one thing that changes afterwards is marking a payment "available to the team", which is one-way.
export default function PaymentsPanel({ contributions, payments, canManage }: PaymentsPanelProps) {
  const router = useRouter()
  const cashContributions = contributions.filter((c) => c.kind === 'cash' && !c.withdrawn)
  const [open, setOpen] = useState(false)
  const [entryType, setEntryType] = useState<PaymentEntryType>('payment')
  const [contributionId, setContributionId] = useState(cashContributions[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [receivedOn, setReceivedOn] = useState(today())
  const [method, setMethod] = useState<PaymentMethod>('check')
  const [reference, setReference] = useState('')
  const [receivedBy, setReceivedBy] = useState<PaymentReceivedBy>('university')
  const [availability, setAvailability] = useState<PaymentAvailability>('held_by_university')
  const [availableOn, setAvailableOn] = useState(today())
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [markingId, setMarkingId] = useState<string | null>(null)

  const parsed = Number(amount)
  const valid = Number.isFinite(parsed) && parsed > 0 && contributionId !== '' && receivedOn !== ''
  const contributionLabel = (id: string) => {
    const c = contributions.find((x) => x.id === id)
    return c ? `${formatMoney(c.committed_amount)}${c.description ? ` — ${c.description}` : ''}` : 'Unknown'
  }

  // the database requires "held" to be received by the university, so keep the two choices consistent
  function changeReceivedBy(value: PaymentReceivedBy) {
    setReceivedBy(value)
    if (value !== 'university' && availability === 'held_by_university') setAvailability('unknown')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      await recordPayment(createClient(), {
        contribution_id: contributionId,
        entry_type: entryType,
        amount: parsed,
        received_on: receivedOn,
        method,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        received_by: receivedBy,
        availability: entryType === 'refund' ? 'unknown' : availability,
        available_on: entryType !== 'refund' && availability === 'available' ? availableOn : null,
      })
      setOpen(false)
      setAmount('')
      setReference('')
      setNotes('')
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not record this entry.'))
    } finally {
      setBusy(false)
    }
  }

  async function handleMark(id: string) {
    setMarkingId(id)
    setError(null)
    try {
      await markPaymentAvailable(createClient(), id, today())
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not mark this payment available.'))
    } finally {
      setMarkingId(null)
    }
  }

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-text-primary">
          <Landmark size={13} className="text-accent-blue" /> Payment ledger
        </h2>
        {canManage && (
          <Button
            size="sm"
            variant="secondary"
            disabled={cashContributions.length === 0}
            title={cashContributions.length === 0 ? 'Add a cash contribution first' : undefined}
            onClick={() => { setError(null); setContributionId((id) => id || cashContributions[0]?.id || ''); setOpen(true) }}
          >
            <Plus size={12} /> Record payment
          </Button>
        )}
      </div>
      {error && !open && <p className="mb-2 text-xs text-rose-400">{error}</p>}

      {payments.length === 0 ? (
        <p className="text-[12px] text-text-muted">No payments recorded yet.</p>
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b border-border font-mono text-[11px] uppercase text-text-muted">
                <th className="py-2 pr-2 font-medium">Received</th>
                <th className="px-2 py-2 font-medium">Entry</th>
                <th className="px-2 py-2 text-right font-medium">Amount</th>
                <th className="px-2 py-2 font-medium">Method</th>
                <th className="px-2 py-2 font-medium">Received by</th>
                <th className="px-2 py-2 font-medium">Availability</th>
                <th className="py-2 pl-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 pr-2 align-top">
                    <div className="text-text-primary">{formatContributionDate(p.received_on, p.received_on_precision)}</div>
                    <div className="text-[11px] text-text-muted">{nameOf(p.recorder) ? `by ${nameOf(p.recorder)}` : 'imported'}</div>
                  </td>
                  <td className="px-2 py-2 align-top">{p.entry_type === 'refund' ? <Badge tone="rose">Refund</Badge> : <Badge tone="emerald">Payment</Badge>}</td>
                  <td className={`px-2 py-2 text-right align-top tabular-nums ${p.entry_type === 'refund' ? 'text-rose-400' : 'text-text-primary'}`}>
                    {p.entry_type === 'refund' ? '−' : ''}
                    {formatMoney(p.amount)}
                  </td>
                  <td className="px-2 py-2 align-top text-text-secondary">
                    {PAYMENT_METHOD_LABEL[p.method]}
                    {p.reference && <div className="text-[11px] text-text-muted">{p.reference}</div>}
                  </td>
                  <td className="px-2 py-2 align-top text-text-secondary">{RECEIVED_BY_LABEL[p.received_by]}</td>
                  <td className="px-2 py-2 align-top">
                    {p.entry_type === 'payment' ? (
                      <>
                        <Badge tone={AVAILABILITY_TONE[p.availability]}>{AVAILABILITY_LABEL[p.availability]}</Badge>
                        {p.availability === 'available' && p.available_on && <div className="mt-0.5 text-[11px] text-text-muted">since {formatContributionDate(p.available_on)}</div>}
                      </>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className="py-2 pl-2 text-right align-top">
                    {canManage && p.entry_type === 'payment' && p.availability !== 'available' && (
                      <Button size="sm" variant="ghost" disabled={markingId === p.id} onClick={() => handleMark(p.id)}>
                        {markingId === p.id ? 'Saving…' : 'Mark available'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[11px] text-text-muted">Entries are permanent. To correct a mistake, record a refund and a new payment.</p>

      <Modal open={open} onClose={busy ? () => {} : () => setOpen(false)} title={entryType === 'refund' ? 'Record a refund' : 'Record a payment'} maxWidthClassName="max-w-md">
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-mono text-[11px] uppercase text-text-muted">Entry</label>
              <Select value={entryType} onChange={(e) => setEntryType(e.target.value as PaymentEntryType)} disabled={busy}>
                <option value="payment">Payment received</option>
                <option value="refund">Refund</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block font-mono text-[11px] uppercase text-text-muted">Amount ($)</label>
              <Input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} autoFocus />
            </div>
          </div>
          <div>
            <label className="mb-1 block font-mono text-[11px] uppercase text-text-muted">Against cash contribution</label>
            <Select value={contributionId} onChange={(e) => setContributionId(e.target.value)} disabled={busy}>
              {cashContributions.map((c) => (
                <option key={c.id} value={c.id}>
                  {contributionLabel(c.id)}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-mono text-[11px] uppercase text-text-muted">{entryType === 'refund' ? 'Refunded on' : 'Received on'}</label>
              <Input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} disabled={busy} />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[11px] uppercase text-text-muted">Method</label>
              <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} disabled={busy}>
                {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABEL[m]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <label className="mb-1 block font-mono text-[11px] uppercase text-text-muted">Reference (check number, transaction id…)</label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} disabled={busy} />
          </div>
          {entryType === 'payment' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-mono text-[11px] uppercase text-text-muted">Received by</label>
                  <Select value={receivedBy} onChange={(e) => changeReceivedBy(e.target.value as PaymentReceivedBy)} disabled={busy}>
                    {(Object.keys(RECEIVED_BY_LABEL) as PaymentReceivedBy[]).map((r) => (
                      <option key={r} value={r}>
                        {RECEIVED_BY_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[11px] uppercase text-text-muted">Available to the team?</label>
                  <Select value={availability} onChange={(e) => setAvailability(e.target.value as PaymentAvailability)} disabled={busy}>
                    {(Object.keys(AVAILABILITY_LABEL) as PaymentAvailability[])
                      .filter((a) => a !== 'held_by_university' || receivedBy === 'university')
                      .map((a) => (
                        <option key={a} value={a}>
                          {AVAILABILITY_LABEL[a]}
                        </option>
                      ))}
                  </Select>
                </div>
              </div>
              {availability === 'available' && (
                <div>
                  <label className="mb-1 block font-mono text-[11px] uppercase text-text-muted">Available since</label>
                  <Input type="date" value={availableOn} onChange={(e) => setAvailableOn(e.target.value)} disabled={busy} />
                </div>
              )}
            </>
          )}
          <div>
            <label className="mb-1 block font-mono text-[11px] uppercase text-text-muted">Notes (optional)</label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy} />
          </div>
          <p className="text-[12px] text-text-muted">This entry cannot be edited or deleted afterwards.</p>
          {error && <p className="text-rose-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !valid}>
              {busy ? 'Recording…' : entryType === 'refund' ? 'Record refund' : 'Record payment'}
            </Button>
          </div>
        </form>
      </Modal>
    </Panel>
  )
}

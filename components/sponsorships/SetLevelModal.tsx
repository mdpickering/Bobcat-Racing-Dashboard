'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import { createClient } from '@/lib/supabase/client'
import { setSponsorshipLevel } from '@/lib/supabase/queries/sponsorships'
import { getErrorMessage } from '@/lib/errors'
import { formatMoney, qualify } from '@/lib/sponsorships'
import type { SponsorshipLevel } from '@/types/database'

interface SetLevelModalProps {
  open: boolean
  onClose: () => void
  sponsorshipId: string
  levels: SponsorshipLevel[]
  currentLevelId: string | null
  cashCommitted: number
  inKindValue: number
}

const CUSTOM = '__custom__'

// The level is only ever written by the database function set_sponsorship_level(), which reads the live
// contributions itself and records an immutable decision (who, when, the basis and the reason). This dialog shows
// the same arithmetic beforehand so the outcome is no surprise; it sends no numbers, only the chosen level and reason.
export default function SetLevelModal({ open, onClose, sponsorshipId, levels, currentLevelId, cashCommitted, inKindValue }: SetLevelModalProps) {
  const router = useRouter()
  const activeLevels = levels.filter((l) => l.active)
  const [choice, setChoice] = useState<string>(currentLevelId ?? '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const level = useMemo(() => activeLevels.find((l) => l.id === choice) ?? null, [activeLevels, choice])
  const custom = choice === CUSTOM
  const q = qualify(cashCommitted, inKindValue, level)
  const belowMinimum = level !== null && q.qualifies === false
  const reasonRequired = custom || belowMinimum
  const reasonOk = !reasonRequired || reason.trim().length > 0
  // re-recording the same level is only useful to accept a below-minimum value as an exception
  const unchanged = choice === (currentLevelId ?? '') && !custom && !belowMinimum
  const canSubmit = !busy && choice !== '' && reasonOk && !unchanged

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await setSponsorshipLevel(createClient(), sponsorshipId, custom ? null : choice, reason.trim() || null)
      setReason('')
      onClose()
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not set the level.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title="Set the sponsorship level" maxWidthClassName="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="rounded-lg border border-border p-3">
          <div className="font-mono text-[11px] uppercase text-text-muted">Qualifying value</div>
          <div className="mt-1.5 space-y-1">
            <div className="flex justify-between text-text-secondary">
              <span>Cash committed</span>
              <span className="tabular-nums text-text-primary">{formatMoney(cashCommitted)}</span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>+ In-kind estimated value</span>
              <span className="tabular-nums text-text-primary">{formatMoney(inKindValue)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1 font-semibold text-text-primary">
              <span>Qualifying total</span>
              <span className="tabular-nums">{formatMoney(q.total)}</span>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-text-muted">Withdrawn contributions are not counted. The database recalculates this itself when you save.</p>
        </div>

        <div>
          <label className="mb-1 block font-mono text-[11px] uppercase text-text-muted">Level</label>
          <Select value={choice} onChange={(e) => setChoice(e.target.value)} disabled={busy}>
            <option value="">Select a level…</option>
            {activeLevels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} — {formatMoney(l.min_amount)}+
              </option>
            ))}
            <option value={CUSTOM}>Custom sponsorship (no standard level)</option>
          </Select>
        </div>

        {level && (
          <div className={`flex items-start gap-2 rounded-lg border p-3 ${q.qualifies ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
            {q.qualifies ? <CheckCircle2 size={15} className="mt-0.5 flex-shrink-0 text-emerald-400" /> : <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-amber-400" />}
            <div className="space-y-0.5 text-text-secondary">
              <div>
                <span className="font-semibold text-text-primary">{level.name}</span> minimum: {formatMoney(q.minimum)}
              </div>
              {q.qualifies ? (
                <div>Qualifies — {formatMoney(q.total - (q.minimum ?? 0))} above the minimum.</div>
              ) : (
                <div>
                  Does <span className="font-semibold text-amber-400">not</span> qualify — {formatMoney(q.shortfall)} below the minimum. It can still be recorded as an exception with a written reason.
                </div>
              )}
            </div>
          </div>
        )}

        {reasonRequired && (
          <div>
            <label className="mb-1 block font-mono text-[11px] uppercase text-text-muted">{custom ? 'Custom terms / reason (required)' : 'Reason for the exception (required)'}</label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
              placeholder={custom ? 'What was agreed, e.g. banner at the event plus $1,200' : 'Why this level is being given below its minimum'}
            />
          </div>
        )}
        {!reasonRequired && choice && (
          <div>
            <label className="mb-1 block font-mono text-[11px] uppercase text-text-muted">Note (optional)</label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} />
          </div>
        )}

        <p className="text-[12px] text-text-muted">This adds a permanent entry to the level history. A level is never changed automatically when contributions change; you will only see a review flag.</p>
        {unchanged && choice && <p className="text-[12px] text-text-muted">This level is already recorded. Choose a different one to change it.</p>}
        {error && <p className="text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {busy ? 'Saving…' : belowMinimum ? 'Record exception' : custom ? 'Record custom terms' : 'Set level'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

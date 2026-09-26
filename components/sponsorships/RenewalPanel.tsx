'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Pencil } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import StatusBadge from '@/components/ui/StatusBadge'
import { createClient } from '@/lib/supabase/client'
import { updateSponsorship } from '@/lib/supabase/queries/sponsorships'
import { getErrorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { formatContributionDate } from '@/lib/sponsorships'
import { RENEWAL_STATE_LABEL, RENEWAL_THRESHOLDS, daysRemainingLabel, renewalStateHelp } from '@/lib/sponsorshipRenewals'
import { statusTone } from '@/lib/status'
import type { SponsorshipRenewalReminder, SponsorshipRenewalStatus } from '@/types/database'

interface RenewalPanelProps {
  sponsorshipId: string
  renewalDate: string | null
  responsibleName: string | null
  status: SponsorshipRenewalStatus | null
  reminders: SponsorshipRenewalReminder[]
  canManage: boolean
}

// The renewal date, where it stands, and whether reminders are set up. The state is derived by the database from the
// date, today and the stage (it is not a pipeline stage); the reminders themselves are sent by the email worker.
// Managers (Sponsorship Lead, Business Lead, admin/CTO) edit the date; everyone else sees it.
export default function RenewalPanel({ sponsorshipId, renewalDate, responsibleName, status, reminders, canManage }: RenewalPanelProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(renewalDate?.slice(0, 10) ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(next: string | null) {
    setBusy(true)
    setError(null)
    try {
      await updateSponsorship(createClient(), sponsorshipId, { renewal_date: next })
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save the renewal date.'))
    } finally {
      setBusy(false)
    }
  }

  const sentByThreshold = new Map(reminders.map((r) => [r.threshold_days, r]))
  const days = daysRemainingLabel(status?.days_remaining)
  const recipients = status?.reminder_recipients ?? null

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
          <CalendarClock size={13} className="text-accent-blue" /> Renewal
        </h2>
        {canManage && (
          <Button size="sm" variant="secondary" onClick={() => { setError(null); setDate(renewalDate?.slice(0, 10) ?? ''); setOpen(true) }}>
            <Pencil size={12} /> {renewalDate ? 'Change date' : 'Set date'}
          </Button>
        )}
      </div>

      {!status ? (
        <p className="text-[12px] text-text-muted">{renewalDate ? `Renewal date: ${formatContributionDate(renewalDate)}` : 'No renewal date set.'}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <StatusBadge tone={statusTone('renewal', status.renewal_state)}>{RENEWAL_STATE_LABEL[status.renewal_state]}</StatusBadge>
            {renewalDate && <span className="text-xs font-medium text-text-primary">{formatContributionDate(renewalDate)}</span>}
            {days && status.renewal_state !== 'not_applicable' && status.renewal_state !== 'renewed' && (
              <span className={`text-[12px] ${status.renewal_state === 'overdue' ? 'font-medium text-status-danger' : 'text-text-secondary'}`}>{days}</span>
            )}
          </div>
          <p className="text-[12px] text-text-muted">{renewalStateHelp(status.renewal_state, recipients)}</p>

          {renewalDate && (status.renewal_state === 'scheduled' || status.renewal_state === 'approaching' || reminders.length > 0) && (
            <div>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">Reminders for this date</div>
              <ul className="space-y-1 text-xs">
                {RENEWAL_THRESHOLDS.map((t) => {
                  const sent = sentByThreshold.get(t)
                  return (
                    <li key={t} className="flex items-center justify-between gap-3">
                      <span className="text-text-secondary">{t} days before</span>
                      {sent ? <span className="text-status-success">Sent {formatDate(sent.created_at)}</span> : <span className="text-text-muted">Not sent</span>}
                    </li>
                  )
                })}
              </ul>
              <p className="mt-2 text-[11px] text-text-muted">If the worker misses a threshold, only the tightest one that has passed is sent. A new renewal date starts a fresh set.</p>
            </div>
          )}

          {(status.renewal_state === 'scheduled' || status.renewal_state === 'approaching') && recipients !== 0 && (
            <div className="text-[12px] text-text-secondary">
              Goes to {responsibleName ? <span className="text-text-primary">{responsibleName}</span> : 'the responsible person (not assigned)'} and the Sponsorship Lead
              {recipients != null ? ` (${recipients} ${recipients === 1 ? 'person' : 'people'} in total)` : ''}. Each person can turn off the email under Account &gt; Email Notifications; the in-app notification is always sent.
            </div>
          )}
        </div>
      )}

      <Modal open={open} onClose={busy ? () => {} : () => setOpen(false)} title="Renewal date" maxWidthClassName="max-w-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!busy) save(date || null)
          }}
          className="space-y-3 text-xs"
        >
          <div>
            <label htmlFor="renewal-date" className="mb-1 block text-xs text-text-secondary">Renewal date</label>
            <Input id="renewal-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={busy} autoFocus />
          </div>
          <p className="text-[12px] text-text-muted">
            Reminders are sent 60, 30 and 7 days before this date, only while the sponsorship is Committed and has not already been renewed in a later season. Changing the date starts a new set of reminders.
          </p>
          {error && <p className="text-status-danger">{error}</p>}
          <div className="flex items-center justify-between gap-2">
            <div>
              {renewalDate && (
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => save(null)}>
                  Clear date
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !date || date === (renewalDate?.slice(0, 10) ?? '')}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </Panel>
  )
}

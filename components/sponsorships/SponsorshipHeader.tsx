'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ExternalLink, History, Pencil } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import ReadOnlyNotice from '@/components/ui/ReadOnlyNotice'
import { StageBadge } from './SponsorshipBadges'
import { createClient } from '@/lib/supabase/client'
import { updateSponsorship } from '@/lib/supabase/queries/sponsorships'
import { getErrorMessage } from '@/lib/errors'
import { SPONSOR_TYPE_LABEL, STAGES, STAGE_LABEL, formatContributionDate, seasonLabel } from '@/lib/sponsorships'
import type { Sponsor, Sponsorship, SponsorshipStage } from '@/types/database'

interface SponsorshipHeaderProps {
  sponsorship: Sponsorship & { sponsor: Sponsor; responsible: { id: string; display_name: string | null; email: string | null } | null }
  eventName: string | null
  businessMembers: { user_id: string; name: string }[]
  canManage: boolean
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</div>
    <div className="mt-1 text-xs text-text-primary">{children}</div>
  </div>
)

export default function SponsorshipHeader({ sponsorship, eventName, businessMembers, canManage }: SponsorshipHeaderProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    agreement_url: sponsorship.agreement_url ?? '',
    notes: sponsorship.notes ?? '',
    custom_terms: sponsorship.custom_terms ?? '',
    renewal_date: sponsorship.renewal_date ?? '',
    responsible_user_id: sponsorship.responsible_user_id ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const s = sponsorship
  const responsibleName = s.responsible?.display_name || s.responsible?.email || null
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }))

  async function save(patch: Parameters<typeof updateSponsorship>[2]) {
    setBusy(true)
    setError(null)
    try {
      await updateSponsorship(createClient(), s.id, patch)
      router.refresh()
      return true
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save.'))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault()
    const ok = await save({
      agreement_url: form.agreement_url.trim() || null,
      notes: form.notes.trim() || null,
      custom_terms: form.custom_terms.trim() || null,
      renewal_date: form.renewal_date || null,
      responsible_user_id: form.responsible_user_id || null,
    })
    if (ok) setEditing(false)
  }

  const meta = [seasonLabel(s.season), eventName, SPONSOR_TYPE_LABEL[s.sponsor.sponsor_type]].filter(Boolean).join(' · ')

  return (
    <>
      <PageHeader
        title={s.sponsor.name}
        description={
          <span>
            {meta}
            {s.sponsor.website && (
              <>
                {' · '}
                <a href={s.sponsor.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-accent-blue">
                  {s.sponsor.website.replace(/^https?:\/\//, '')} <ExternalLink size={11} aria-hidden="true" />
                </a>
              </>
            )}
          </span>
        }
        back={{ label: 'Back to sponsorships', href: '/business/sponsorships' }}
        actions={
          <>
            <Link href={`/business/sponsors/${s.sponsor_id}`} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-raised px-2.5 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:bg-border/60">
              <History size={13} aria-hidden="true" /> All seasons
            </Link>
            {canManage && (
              <Button size="sm" variant="secondary" onClick={() => { setError(null); setEditing(true) }}>
                <Pencil size={13} /> Edit details
              </Button>
            )}
          </>
        }
      >
        {!canManage && <div className="mb-4"><ReadOnlyNotice>You can view this sponsorship. The Sponsorship Lead, Business Lead or an admin makes changes.</ReadOnlyNotice></div>}
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4 border-b border-border pb-5">
          <div>
            <label htmlFor="stage" className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
              Stage
            </label>
            <div className="mt-1">
              {canManage ? (
                <Select
                  id="stage"
                  className="w-40"
                  value={s.stage}
                  disabled={busy}
                  onChange={(e) => save({ stage: e.target.value as SponsorshipStage, ...(e.target.value === 'committed' && !s.committed_on ? { committed_on: new Date().toISOString().slice(0, 10) } : {}) })}
                >
                  {STAGES.map((st) => (
                    <option key={st} value={st}>
                      {STAGE_LABEL[st]}
                    </option>
                  ))}
                </Select>
              ) : (
                <StageBadge stage={s.stage} />
              )}
            </div>
          </div>
          <Field label="Responsible">{responsibleName ?? <span className="text-text-muted">Not assigned</span>}</Field>
          <Field label="Committed">{s.committed_on ? formatContributionDate(s.committed_on) : <span className="text-text-muted">—</span>}</Field>
          <Field label="Renewal">{s.renewal_date ? formatContributionDate(s.renewal_date) : <span className="text-text-muted">—</span>}</Field>
          <Field label="Agreement">
            {s.agreement_url ? (
              <a href={s.agreement_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-blue hover:underline">
                Open agreement <ExternalLink size={11} aria-hidden="true" />
              </a>
            ) : (
              <span className="text-text-muted">No link</span>
            )}
          </Field>
        </div>
        {error && !editing && <p className="mt-2 text-xs text-status-danger">{error}</p>}
        {canManage && s.stage !== 'committed' && <p className="mt-2 text-xs text-text-muted">A sponsorship can be marked Committed once it has an active contribution and a level decision.</p>}
        {s.notes && (
          <div className="mt-4">
            <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Notes</div>
            <p className="mt-1 max-w-3xl whitespace-pre-wrap text-xs text-text-secondary">{s.notes}</p>
          </div>
        )}
      </PageHeader>

      <Modal open={editing} onClose={busy ? () => {} : () => setEditing(false)} title="Edit sponsorship details" maxWidthClassName="max-w-md">
        <form onSubmit={handleSaveDetails} className="space-y-5 text-xs">
          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-semibold text-text-primary">Ownership</legend>
            <div>
              <label className="mb-1 block text-xs text-text-secondary">Responsible Business member</label>
              <Select value={form.responsible_user_id} onChange={(e) => set('responsible_user_id', e.target.value)} disabled={busy}>
                <option value="">Not assigned</option>
                {businessMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-secondary">Renewal date (optional)</label>
              <Input type="date" value={form.renewal_date} onChange={(e) => set('renewal_date', e.target.value)} disabled={busy} />
            </div>
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-semibold text-text-primary">Agreement and terms</legend>
            <div>
              <label className="mb-1 block text-xs text-text-secondary">Agreement link (optional)</label>
              <Input value={form.agreement_url} onChange={(e) => set('agreement_url', e.target.value)} placeholder="https://…" disabled={busy} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-secondary">Custom terms (optional)</label>
              <Textarea rows={2} value={form.custom_terms} onChange={(e) => set('custom_terms', e.target.value)} disabled={busy} />
            </div>
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-semibold text-text-primary">Additional</legend>
            <div>
              <label className="mb-1 block text-xs text-text-secondary">Notes (optional)</label>
              <Textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} disabled={busy} />
            </div>
          </fieldset>
          {error && <p className="text-status-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}

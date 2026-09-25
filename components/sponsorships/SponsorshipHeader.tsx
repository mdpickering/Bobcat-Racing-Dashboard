'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ExternalLink, Pencil } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
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

  return (
    <Panel className="p-5">
      <Link href="/business/sponsorships" className="mb-3 flex items-center gap-1 text-[12px] text-text-muted hover:text-accent-blue">
        <ChevronLeft size={13} /> Back to sponsorships
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-base font-bold text-text-primary">{s.sponsor.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-text-muted">
            <span>
              {seasonLabel(s.season)}
              {eventName ? ` · ${eventName}` : ''}
            </span>
            <span>· {SPONSOR_TYPE_LABEL[s.sponsor.sponsor_type]}</span>
            {s.sponsor.website && (
              <a href={s.sponsor.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-accent-blue">
                · {s.sponsor.website.replace(/^https?:\/\//, '')} <ExternalLink size={10} />
              </a>
            )}
            <Link href={`/business/sponsors/${s.sponsor_id}`} className="text-accent-blue hover:underline">
              · All seasons for this sponsor
            </Link>
          </div>
        </div>
        {canManage && (
          <Button size="sm" variant="secondary" onClick={() => { setError(null); setEditing(true) }}>
            <Pencil size={12} /> Edit details
          </Button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-border pt-4">
        <div>
          <label className="mb-1 block font-mono text-[11px] uppercase text-text-muted">Stage</label>
          {canManage ? (
            <Select
              className="w-40"
              value={s.stage}
              disabled={busy}
              aria-label="Stage"
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
        <div>
          <div className="font-mono text-[11px] uppercase text-text-muted">Responsible</div>
          <div className="mt-1 text-xs text-text-primary">{responsibleName ?? <span className="text-text-muted">Not assigned</span>}</div>
        </div>
        <div>
          <div className="font-mono text-[11px] uppercase text-text-muted">Committed</div>
          <div className="mt-1 text-xs text-text-primary">{s.committed_on ? formatContributionDate(s.committed_on) : <span className="text-text-muted">—</span>}</div>
        </div>
        <div>
          <div className="font-mono text-[11px] uppercase text-text-muted">Renewal</div>
          <div className="mt-1 text-xs text-text-primary">{s.renewal_date ? formatContributionDate(s.renewal_date) : <span className="text-text-muted">—</span>}</div>
        </div>
      </div>
      {error && !editing && <p className="mt-2 text-xs text-status-danger">{error}</p>}
      {canManage && s.stage !== 'committed' && <p className="mt-2 text-[11px] text-text-muted">A sponsorship can be marked Committed once it has an active contribution and a level decision.</p>}

      <div className="mt-4 grid grid-cols-1 gap-4 text-xs md:grid-cols-2">
        <div>
          <div className="font-mono text-[11px] uppercase text-text-muted">Agreement</div>
          <div className="mt-1">
            {s.agreement_url ? (
              <a href={s.agreement_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-accent-blue hover:underline">
                Open agreement <ExternalLink size={11} />
              </a>
            ) : (
              <span className="text-text-muted">No agreement link</span>
            )}
          </div>
        </div>
        <div>
          <div className="font-mono text-[11px] uppercase text-text-muted">Notes</div>
          <p className="mt-1 whitespace-pre-wrap text-text-secondary">{s.notes || <span className="text-text-muted">No notes</span>}</p>
        </div>
      </div>

      <Modal open={editing} onClose={busy ? () => {} : () => setEditing(false)} title="Edit sponsorship details" maxWidthClassName="max-w-md">
        <form onSubmit={handleSaveDetails} className="space-y-3 text-xs">
          <div>
            <label className="mb-1 block font-mono text-[11px] uppercase text-text-muted">Responsible Business member</label>
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
            <label className="mb-1 block font-mono text-[11px] uppercase text-text-muted">Agreement link (optional)</label>
            <Input value={form.agreement_url} onChange={(e) => set('agreement_url', e.target.value)} placeholder="https://…" disabled={busy} />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[11px] uppercase text-text-muted">Renewal date (optional)</label>
            <Input type="date" value={form.renewal_date} onChange={(e) => set('renewal_date', e.target.value)} disabled={busy} />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[11px] uppercase text-text-muted">Custom terms (optional)</label>
            <Textarea rows={2} value={form.custom_terms} onChange={(e) => set('custom_terms', e.target.value)} disabled={busy} />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[11px] uppercase text-text-muted">Notes (optional)</label>
            <Textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} disabled={busy} />
          </div>
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
    </Panel>
  )
}

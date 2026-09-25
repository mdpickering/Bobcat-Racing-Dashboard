'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { createClient } from '@/lib/supabase/client'
import { createSponsor, createSponsorship } from '@/lib/supabase/queries/sponsorships'
import { getErrorMessage } from '@/lib/errors'
import { SPONSOR_TYPE_LABEL, seasonLabel } from '@/lib/sponsorships'
import type { Sponsor, SponsorType } from '@/types/database'

interface AddSponsorshipButtonProps {
  season: string
  sponsors: Pick<Sponsor, 'id' | 'name' | 'active'>[]
}

const NEW = '__new__'

// Starts a sponsorship for the selected season, for an existing sponsor or a new one. New sponsorships always begin
// as a Prospect; a level and the Committed stage come later, once there is a contribution to base them on.
export default function AddSponsorshipButton({ season, sponsors }: AddSponsorshipButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [sponsorId, setSponsorId] = useState(sponsors.length > 0 ? '' : NEW)
  const [name, setName] = useState('')
  const [type, setType] = useState<SponsorType>('company')
  const [website, setWebsite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // if the sponsor was created but the sponsorship failed, a retry must reuse that sponsor, not create it again
  const [createdSponsorId, setCreatedSponsorId] = useState<string | null>(null)

  const creatingNew = sponsorId === NEW
  const canSubmit = !busy && (creatingNew ? name.trim().length > 0 : sponsorId !== '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      let id = creatingNew ? createdSponsorId : sponsorId
      if (!id) {
        id = await createSponsor(supabase, { name, sponsor_type: type, website })
        setCreatedSponsorId(id)
      }
      const sponsorshipId = await createSponsorship(supabase, { sponsor_id: id, season, stage: 'prospect' })
      setOpen(false)
      router.push(`/business/sponsorships/${sponsorshipId}`)
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not add this sponsorship.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => { setError(null); setOpen(true) }}>
        <Plus size={13} /> Add sponsorship
      </Button>
      <Modal open={open} onClose={busy ? () => {} : () => setOpen(false)} title={`Add a sponsorship for ${seasonLabel(season)}`} maxWidthClassName="max-w-md">
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="mb-1 block font-mono text-[11px] uppercase text-text-muted">Sponsor</label>
            <Select value={sponsorId} onChange={(e) => setSponsorId(e.target.value)} disabled={busy}>
              {sponsors.length > 0 && <option value="">Select a sponsor…</option>}
              {sponsors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.active ? '' : ' (archived)'}
                </option>
              ))}
              <option value={NEW}>＋ A new sponsor…</option>
            </Select>
          </div>

          {creatingNew && (
            <>
              <div>
                <label className="mb-1 block font-mono text-[11px] uppercase text-text-muted">Sponsor name</label>
                <Input value={name} onChange={(e) => { setName(e.target.value); setCreatedSponsorId(null) }} placeholder="e.g. Acme Corp" maxLength={120} disabled={busy} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-mono text-[11px] uppercase text-text-muted">Type</label>
                  <Select value={type} onChange={(e) => setType(e.target.value as SponsorType)} disabled={busy}>
                    {(Object.keys(SPONSOR_TYPE_LABEL) as SponsorType[]).map((t) => (
                      <option key={t} value={t}>
                        {SPONSOR_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[11px] uppercase text-text-muted">Website (optional)</label>
                  <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" disabled={busy} />
                </div>
              </div>
            </>
          )}

          <p className="text-[12px] text-text-muted">It starts as a Prospect. Add a contribution and a level from its page.</p>
          {error && <p className="text-rose-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {busy ? 'Adding…' : 'Add sponsorship'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}

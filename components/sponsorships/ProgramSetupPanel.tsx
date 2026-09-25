'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ListChecks } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import { createClient } from '@/lib/supabase/client'
import { createSponsorshipProgram } from '@/lib/supabase/queries/sponsorships'
import { getErrorMessage } from '@/lib/errors'
import { FLYER_PROGRAM, formatMoney, seasonLabel, seasonShort } from '@/lib/sponsorships'

interface ProgramSetupPanelProps {
  season: string
  canManage: boolean
  historical: boolean
  // other seasons that already have a program, offered as a "copy from" source
  copyableSeasons: string[]
}

// Shown only for a season with no levels. Creating the program is an explicit, confirmed action; the database
// (create_sponsorship_program) refuses a second setup, and the button is hidden once levels exist.
export default function ProgramSetupPanel({ season, canManage, historical, copyableSeasons }: ProgramSetupPanelProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState('flyer')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setBusy(true)
    setError(null)
    try {
      await createSponsorshipProgram(createClient(), season, source === 'flyer' ? null : source)
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not set up the program.'))
    } finally {
      setBusy(false)
    }
  }

  if (historical) {
    return (
      <Panel className="p-4">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-text-primary">{seasonLabel(season)} is a past season</h2>
        <p className="text-[11px] text-text-muted">
          Past seasons have no sponsorship levels. Records for this season stay “historical — no level” until someone deliberately assigns one; no level is ever invented.
        </p>
      </Panel>
    )
  }

  return (
    <Panel className="p-4">
      <h2 className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-text-primary">
        <ListChecks size={13} className="text-accent-blue" /> No sponsorship program for {seasonLabel(season)} yet
      </h2>
      <p className="text-[11px] text-text-muted">The program is the season’s levels (with their minimum amounts) and the standard deliverables each level receives. Sponsorships are given a level from it.</p>
      {canManage ? (
        <Button size="sm" className="mt-3" onClick={() => { setError(null); setOpen(true) }}>
          Set up {seasonShort(season)} program
        </Button>
      ) : (
        <p className="mt-3 text-[11px] text-text-muted">The Sponsorship Lead, the Business Lead or an admin sets this up.</p>
      )}

      <Modal open={open} onClose={busy ? () => {} : () => setOpen(false)} title={`Set up the ${seasonShort(season)} program`} maxWidthClassName="max-w-xl">
        <div className="space-y-4 text-xs">
          {copyableSeasons.length > 0 && (
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Start from</label>
              <Select value={source} onChange={(e) => setSource(e.target.value)} disabled={busy}>
                <option value="flyer">The 2026–27 flyer levels (standard)</option>
                {copyableSeasons.map((s) => (
                  <option key={s} value={s}>
                    Copy the {seasonLabel(s)} program
                  </option>
                ))}
              </Select>
            </div>
          )}

          {source === 'flyer' ? (
            <>
              <p className="text-text-secondary">These four levels and their deliverables will be created for {seasonLabel(season)}:</p>
              <div className="space-y-3">
                {FLYER_PROGRAM.map((level) => (
                  <div key={level.key} className="rounded-lg border border-border p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold text-text-primary">{level.name}</span>
                      <span className="font-mono text-[11px] text-text-secondary">{formatMoney(level.minAmount)}+</span>
                    </div>
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] text-text-secondary">
                      {level.deliverables.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-text-secondary">
              The {seasonLabel(source)} levels, minimum amounts and deliverables will be copied into {seasonLabel(season)}. You can adjust them afterwards.
            </p>
          )}

          <p className="text-[11px] text-text-muted">This can be done once per season. No sponsors or amounts are created.</p>
          {error && <p className="text-rose-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={handleCreate}>
              {busy ? 'Creating…' : `Create ${seasonShort(season)} program`}
            </Button>
          </div>
        </div>
      </Modal>
    </Panel>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Check } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { createCompetitionSettings, updateCompetitionSettings } from '@/lib/supabase/queries/competition'
import type { CompetitionSettings } from '@/types/database'

function toDateInput(v: string | null): string {
  return v ? v.slice(0, 10) : ''
}

function SeasonForm({ season, onSaved }: { season: CompetitionSettings; onSaved: () => void }) {
  const [name, setName] = useState(season.competition_name ?? '')
  const [competitionDate, setCompetitionDate] = useState(toDateInput(season.competition_date))
  const [buildStart, setBuildStart] = useState(toDateInput(season.build_start))
  const [designFreeze, setDesignFreeze] = useState(toDateInput(season.design_freeze))
  const [manufacturingStart, setManufacturingStart] = useState(toDateInput(season.manufacturing_start))
  const [testingStart, setTestingStart] = useState(toDateInput(season.testing_start))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const supabase = createClient()
      await updateCompetitionSettings(supabase, season.season, {
        competition_name: name || null,
        competition_date: competitionDate || null,
        build_start: buildStart || null,
        design_freeze: designFreeze || null,
        manufacturing_start: manufacturingStart || null,
        testing_start: testingStart || null,
      })
      setSaved(true)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this season.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel className="p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-text-primary">{season.season}</h3>
      <form onSubmit={handleSave} className="space-y-3 text-xs">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Competition Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Baja SAE California" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Competition Date</label>
            <Input type="date" value={competitionDate} onChange={(e) => setCompetitionDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Build Start</label>
            <Input type="date" value={buildStart} onChange={(e) => setBuildStart(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Design Freeze</label>
            <Input type="date" value={designFreeze} onChange={(e) => setDesignFreeze(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Manufacturing Start</label>
            <Input type="date" value={manufacturingStart} onChange={(e) => setManufacturingStart(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Testing Start</label>
            <Input type="date" value={testingStart} onChange={(e) => setTestingStart(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-rose-400">{error}</p>}
        <div className="flex items-center gap-3">
          <Button size="sm" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-emerald-400">
              <Check size={12} /> Saved
            </span>
          )}
        </div>
      </form>
    </Panel>
  )
}

export default function CompetitionSettingsForm({ seasons }: { seasons: CompetitionSettings[] }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [newSeason, setNewSeason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAddSeason(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await createCompetitionSettings(supabase, { season: newSeason })
      setNewSeason('')
      setAdding(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this season — it may already exist.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {!adding && (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus size={13} /> New Season
          </Button>
        )}
      </div>

      {adding && (
        <Panel className="p-4">
          <form onSubmit={handleAddSeason} className="flex items-end gap-2 text-xs">
            <div className="flex-1">
              <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Season (e.g. 2027)</label>
              <Input required value={newSeason} onChange={(e) => setNewSeason(e.target.value)} placeholder="2027" />
            </div>
            <Button size="sm" type="submit" disabled={busy || !newSeason}>
              Create
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </form>
          {error && <p className="mt-2 text-[11px] text-rose-400">{error}</p>}
        </Panel>
      )}

      {seasons.length === 0 ? (
        <Panel className="p-6 text-center text-xs text-text-muted">No competition seasons configured yet.</Panel>
      ) : (
        seasons.map((s) => <SeasonForm key={s.season} season={s} onSaved={() => router.refresh()} />)
      )}
    </div>
  )
}

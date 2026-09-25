'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import { STAGES, STAGE_LABEL, seasonLabel } from '@/lib/sponsorships'
import type { SponsorshipLevel } from '@/types/database'

interface SponsorshipFiltersProps {
  seasons: { season: string; competition_name: string | null }[]
  selectedSeason: string
  levels: SponsorshipLevel[]
}

// Season, stage, level, review and name filters all live in the URL, so a filtered view can be bookmarked or shared.
export default function SponsorshipFilters({ seasons, selectedSeason, levels }: SponsorshipFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [search, setSearch] = useState(searchParams.get('q') ?? '')

  useEffect(() => {
    setSearch(searchParams.get('q') ?? '')
  }, [searchParams])

  function update(changes: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      {/* changing season clears the level filter: levels belong to a season */}
      <Select className="sm:w-44" aria-label="Season" value={selectedSeason} onChange={(e) => update({ season: e.target.value, level: '' })}>
        {seasons.map((s) => (
          <option key={s.season} value={s.season}>
            {seasonLabel(s.season)}
            {s.competition_name ? ` — ${s.competition_name}` : ''}
          </option>
        ))}
      </Select>

      <Select className="sm:w-36" aria-label="Stage" value={searchParams.get('stage') ?? ''} onChange={(e) => update({ stage: e.target.value })}>
        <option value="">All stages</option>
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABEL[s]}
          </option>
        ))}
      </Select>

      <Select className="sm:w-40" aria-label="Level" value={searchParams.get('level') ?? ''} onChange={(e) => update({ level: e.target.value })}>
        <option value="">All levels</option>
        {levels.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
        <option value="none">No level</option>
      </Select>

      <Select className="sm:w-40" aria-label="Level review" value={searchParams.get('review') ?? ''} onChange={(e) => update({ review: e.target.value })}>
        <option value="">Any review status</option>
        <option value="needs_review">Needs level review</option>
      </Select>

      <form
        className="sm:ml-auto sm:w-48"
        onSubmit={(e) => {
          e.preventDefault()
          update({ q: search.trim() })
        }}
      >
        <Input aria-label="Search sponsors" placeholder="Search sponsors…" value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => search.trim() !== (searchParams.get('q') ?? '') && update({ q: search.trim() })} />
      </form>
    </div>
  )
}

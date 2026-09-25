import { createClient } from '@/lib/supabase/server'
import {
  getSponsorshipAccess,
  listSeasons,
  listSponsors,
  listSponsorshipLevels,
  listSponsorshipRows,
} from '@/lib/supabase/queries/sponsorships'
import { getCurrentCompetitionSettings } from '@/lib/supabase/queries/competition'
import { NEEDS_REVIEW_FLAGS, isHistoricalSeason, seasonLabel } from '@/lib/sponsorships'
import type { Profile } from '@/types/user'
import ErrorState, { PermissionDeniedState } from '@/components/ui/ErrorState'
import PageHeader from '@/components/ui/PageHeader'
import ReadOnlyNotice from '@/components/ui/ReadOnlyNotice'
import EmptyState from '@/components/ui/EmptyState'
import SponsorshipFilters from '@/components/sponsorships/SponsorshipFilters'
import SeasonTotals from '@/components/sponsorships/SeasonTotals'
import SponsorshipTable from '@/components/sponsorships/SponsorshipTable'
import ProgramPanel from '@/components/sponsorships/ProgramPanel'
import ProgramSetupPanel from '@/components/sponsorships/ProgramSetupPanel'
import AddSponsorshipButton from '@/components/sponsorships/AddSponsorshipButton'

export default async function SponsorshipsPage({ searchParams }: { searchParams: { [key: string]: string | undefined } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  if (!profileRow) return <ErrorState message="Could not load your profile." />
  const profile = profileRow as Profile

  const access = await getSponsorshipAccess(supabase, profile)
  if (!access.canView) return <PermissionDeniedState message="The Business area is limited to the Business team, the COO, the CTO and Admin accounts." />

  let seasons, current
  try {
    ;[seasons, current] = await Promise.all([listSeasons(supabase), getCurrentCompetitionSettings(supabase)])
  } catch {
    return <ErrorState message="Could not load the seasons." />
  }
  if (seasons.length === 0) {
    return <EmptyState title="No seasons yet" description="Sponsorships are organized by season. An admin creates the season in Administration → Competition." />
  }

  const requested = searchParams.season
  const selected = seasons.find((s) => s.season === requested)?.season ?? seasons.find((s) => s.season === current?.season)?.season ?? seasons[0].season

  let levels, rows, sponsors
  try {
    ;[levels, rows, sponsors] = await Promise.all([
      listSponsorshipLevels(supabase, selected),
      listSponsorshipRows(supabase, selected),
      access.canManage ? listSponsors(supabase) : Promise.resolve([]),
    ])
  } catch {
    return <ErrorState message="Could not load sponsorships." />
  }

  const stage = searchParams.stage
  const level = searchParams.level
  const review = searchParams.review
  const q = (searchParams.q ?? '').trim().toLowerCase()
  const filtered = rows.filter((r) => {
    if (stage && r.stage !== stage) return false
    if (level === 'none' ? r.level_id !== null : level && r.level_id !== level) return false
    if (review === 'needs_review' && !(r.review && NEEDS_REVIEW_FLAGS.includes(r.review.review_flag))) return false
    if (q && !r.sponsor_name.toLowerCase().includes(q)) return false
    return true
  })
  const isFiltered = Boolean(stage || level || review || q)

  const historical = isHistoricalSeason(selected, current?.season ?? null)
  // other seasons that already have a program can be copied into this one
  const otherPrograms: string[] = []
  if (levels.length === 0 && !historical) {
    for (const s of seasons) {
      if (s.season === selected) continue
      if ((await listSponsorshipLevels(supabase, s.season).catch(() => [])).length > 0) otherPrograms.push(s.season)
    }
  }
  const eventName = seasons.find((s) => s.season === selected)?.competition_name

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Sponsorships"
        description={`${seasonLabel(selected)}${eventName ? ` · ${eventName}` : ''} · ${rows.length} sponsorship${rows.length === 1 ? '' : 's'}`}
        back={{ label: 'Back to Business', href: '/business' }}
        actions={access.canManage ? <AddSponsorshipButton season={selected} sponsors={sponsors} /> : <ReadOnlyNotice>Read-only: the Sponsorship Lead, Business Lead or an admin makes changes.</ReadOnlyNotice>}
      />
      <div className="mb-6">
        <SponsorshipFilters seasons={seasons} selectedSeason={selected} levels={levels} />
      </div>

      {rows.length > 0 && (
        <div className="mb-6">
          <SeasonTotals rows={rows} />
        </div>
      )}

      <div className="mb-6">
        {levels.length === 0 ? (
          <ProgramSetupPanel season={selected} canManage={access.canManage} historical={historical} copyableSeasons={otherPrograms} />
        ) : (
          <ProgramPanel season={selected} levels={levels} />
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={`No sponsorships for ${seasonLabel(selected)} yet`}
          description={
            access.canManage
              ? 'Add the first sponsorship with the button above. Totals appear here once there are records; nothing is shown until then.'
              : 'Nothing has been recorded for this season yet. The Sponsorship Lead, the Business Lead or an admin adds sponsorships.'
          }
        />
      ) : (
        <SponsorshipTable rows={filtered} levels={levels} filtered={isFiltered} />
      )}
    </div>
  )
}

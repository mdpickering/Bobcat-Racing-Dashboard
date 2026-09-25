import { createClient } from '@/lib/supabase/server'
import { listCadReviews } from '@/lib/supabase/queries/cad'
import { listSubsystems } from '@/lib/supabase/queries/subsystems'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'
import CadFilters from '@/components/cad/CadFilters'
import CadReviewList from '@/components/cad/CadReviewList'
import CadToolbar from '@/components/cad/CadToolbar'
import ErrorState from '@/components/ui/ErrorState'
import PageHeader from '@/components/ui/PageHeader'

export default async function CadPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined }
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  const profile = profileRow as Profile

  const [subsystems, { data: memberRows }] = await Promise.all([
    listSubsystems(supabase),
    supabase.from('subsystem_members').select('subsystem_id').eq('user_id', profile.id),
  ])
  // The create form must only offer subsystems the submitter can actually
  // submit for — cad_reviews_insert requires cto/admin or membership in that
  // specific subsystem. The filter dropdown correctly keeps the full list.
  const memberSubsystemIds = new Set((memberRows ?? []).map((r) => r.subsystem_id as string))
  const createSubsystemOptions = isCtoOrAdmin(profile) ? subsystems : subsystems.filter((s) => memberSubsystemIds.has(s.id))

  let reviews
  try {
    reviews = await listCadReviews(supabase, {
      subsystemId: searchParams.subsystem,
      status: searchParams.status,
    })
  } catch {
    return <ErrorState message="Could not load CAD reviews." />
  }

  const filtered = Boolean(searchParams.subsystem || searchParams.status)

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="CAD review"
        description={`${reviews.length} review${reviews.length === 1 ? '' : 's'}${filtered ? ' matching your filters' : ''}. Designs submitted for the team to check before manufacturing.`}
        actions={<CadToolbar subsystems={createSubsystemOptions} />}
      />
      <div className="mb-4">
        <CadFilters subsystems={subsystems} />
      </div>
      <CadReviewList reviews={reviews} filtered={filtered} />
    </div>
  )
}
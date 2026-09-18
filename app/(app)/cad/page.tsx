import { createClient } from '@/lib/supabase/server'
import { listCadReviews } from '@/lib/supabase/queries/cad'
import { listSubsystems } from '@/lib/supabase/queries/subsystems'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'
import CadFilters from '@/components/cad/CadFilters'
import CadReviewList from '@/components/cad/CadReviewList'
import CadToolbar from '@/components/cad/CadToolbar'
import ErrorState from '@/components/ui/ErrorState'

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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-text-primary">CAD Review</h1>
        <p className="mt-0.5 text-xs font-mono text-text-muted">
          {reviews.length} review{reviews.length === 1 ? '' : 's'} matching your filters
        </p>
      </div>
      <CadToolbar subsystems={createSubsystemOptions} />
      <CadFilters subsystems={subsystems} />
      <CadReviewList reviews={reviews} />
    </div>
  )
}

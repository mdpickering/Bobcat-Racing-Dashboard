import { createClient } from '@/lib/supabase/server'
import { listCadReviews } from '@/lib/supabase/queries/cad'
import { listSubsystems } from '@/lib/supabase/queries/subsystems'
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

  const subsystems = await listSubsystems(supabase)

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
      <CadToolbar subsystems={subsystems} />
      <CadFilters subsystems={subsystems} />
      <CadReviewList reviews={reviews} />
    </div>
  )
}

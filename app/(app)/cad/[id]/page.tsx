import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCadReviewById, listCadReviewVersions, listCadReviewComments } from '@/lib/supabase/queries/cad'
import { listSubsystemMembers } from '@/lib/supabase/queries/subsystems'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'
import CadReviewDetailHeader from '@/components/cad/CadReviewDetailHeader'
import CadReviewVersionsPanel from '@/components/cad/CadReviewVersionsPanel'
import CadReviewCommentsPanel from '@/components/cad/CadReviewCommentsPanel'
import ErrorState from '@/components/ui/ErrorState'

export default async function CadReviewDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  const profile = profileRow as Profile

  let review
  try {
    review = await getCadReviewById(supabase, params.id)
  } catch {
    return <ErrorState message="Could not load this CAD review." />
  }
  if (!review) notFound()

  const [versions, comments, subsystemMembers] = await Promise.all([
    listCadReviewVersions(supabase, review.id).catch(() => []),
    listCadReviewComments(supabase, review.id).catch(() => []),
    listSubsystemMembers(supabase, review.subsystem_id).catch(() => []),
  ])

  const isLeadHere = subsystemMembers.some((m) => m.user_id === profile.id && m.is_lead)
  const isSubmitter = review.submitted_by === profile.id
  const canApproveManufacturing = isCtoOrAdmin(profile)
  const canManage = canApproveManufacturing || isLeadHere
  const canEditDetails = canManage || isSubmitter
  const canAddVersion = canManage || isSubmitter

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <CadReviewDetailHeader
        review={review}
        canEditDetails={canEditDetails}
        canManage={canManage}
        canApproveManufacturing={canApproveManufacturing}
        isSubmitter={isSubmitter}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <CadReviewVersionsPanel cadReviewId={review.id} versions={versions} canAddVersion={canAddVersion} />
        <CadReviewCommentsPanel cadReviewId={review.id} comments={comments} currentUserId={profile.id} canModerate={isCtoOrAdmin(profile)} />
      </div>
    </div>
  )
}

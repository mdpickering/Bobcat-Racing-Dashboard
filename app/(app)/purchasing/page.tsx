import { createClient } from '@/lib/supabase/server'
import { listPurchaseRequests } from '@/lib/supabase/queries/purchasing'
import { listSubsystems } from '@/lib/supabase/queries/subsystems'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'
import PurchaseFilters from '@/components/purchasing/PurchaseFilters'
import PurchaseRequestList from '@/components/purchasing/PurchaseRequestList'
import PurchasingToolbar from '@/components/purchasing/PurchasingToolbar'
import ErrorState from '@/components/ui/ErrorState'
import LimitNotice from '@/components/ui/LimitNotice'
import { hitLimit, parseListLimit } from '@/lib/pagination'
import PageHeader from '@/components/ui/PageHeader'

export const metadata = { title: 'Purchasing' }

export default async function PurchasingPage({
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

  const [subsystems, { data: leadRows }] = await Promise.all([
    listSubsystems(supabase),
    supabase.from('subsystem_members').select('subsystem_id').eq('user_id', profile.id).eq('is_lead', true),
  ])
  const ledSubsystemIds = new Set((leadRows ?? []).map((r) => r.subsystem_id as string))
  const isAnySubsystemLead = ledSubsystemIds.size > 0
  const admin = isCtoOrAdmin(profile)
  const canCreate = admin || isAnySubsystemLead
  // The create form must only offer subsystems the requester can actually
  // submit for — purchase_requests_insert requires cto/admin or lead of
  // that specific subsystem, so a lead who leads only one subsystem
  // picking a default from the full list (as the filter dropdown
  // correctly does) would otherwise default to one they can't submit for.
  const createSubsystemOptions = admin ? subsystems : subsystems.filter((s) => ledSubsystemIds.has(s.id))

  const limit = parseListLimit(searchParams.limit)
  let requests
  try {
    requests = await listPurchaseRequests(supabase, {
      subsystemId: searchParams.subsystem,
      status: searchParams.status,
      limit,
    })
  } catch {
    return <ErrorState message="Could not load purchase requests." />
  }

  const filtered = Boolean(searchParams.subsystem || searchParams.status)
  const capped = hitLimit(requests.length, limit)

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Purchasing"
        description={`${requests.length}${capped ? '+' : ''} request${requests.length === 1 && !capped ? '' : 's'}${filtered ? ' matching your filters' : ''}. Team orders are reviewed and approved before anything is ordered.`}
        actions={<PurchasingToolbar canCreate={canCreate} subsystems={createSubsystemOptions} />}
      />
      <div className="mb-4">
        <PurchaseFilters subsystems={subsystems} />
      </div>
      <PurchaseRequestList requests={requests} filtered={filtered} />
      {capped && <LimitNotice noun="purchase requests" limit={limit} searchParams={searchParams} pathname="/purchasing" />}
    </div>
  )
}
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPurchaseRequestById, listPurchaseRequestItems, listPurchaseStatusHistory } from '@/lib/supabase/queries/purchasing'
import { listSubsystemMembers } from '@/lib/supabase/queries/subsystems'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'
import PurchaseRequestDetailHeader from '@/components/purchasing/PurchaseRequestDetailHeader'
import PurchaseLineItemsPanel from '@/components/purchasing/PurchaseLineItemsPanel'
import PurchaseStatusHistoryPanel from '@/components/purchasing/PurchaseStatusHistoryPanel'
import ErrorState from '@/components/ui/ErrorState'

export default async function PurchaseRequestDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  const profile = profileRow as Profile

  let request
  try {
    request = await getPurchaseRequestById(supabase, params.id)
  } catch {
    return <ErrorState message="Could not load this purchase request." />
  }
  if (!request) notFound()

  const [items, history, subsystemMembers] = await Promise.all([
    listPurchaseRequestItems(supabase, request.id).catch(() => []),
    listPurchaseStatusHistory(supabase, request.id).catch(() => []),
    listSubsystemMembers(supabase, request.subsystem_id).catch(() => []),
  ])

  const isLeadHere = subsystemMembers.some((m) => m.user_id === profile.id && m.is_lead)
  const canApprove = isCtoOrAdmin(profile)
  const canManage = canApprove || isLeadHere
  // Mirrors the purchase_requests_delete RLS policy (migration 0022); the database decides.
  const canDelete = !request.legacy_id && (canApprove || (request.requested_by === profile.id && request.status === 'Draft'))

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PurchaseRequestDetailHeader request={request} canManage={canManage} canApprove={canApprove} canDelete={canDelete} itemCount={items.length} />
      <PurchaseLineItemsPanel purchaseRequestId={request.id} items={items} canManage={canManage} />
      <PurchaseStatusHistoryPanel history={history} />
    </div>
  )
}

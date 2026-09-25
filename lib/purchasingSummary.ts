import type { PurchaseRequest, PurchaseStatus } from '@/types/database'

// Pure purchasing arithmetic for the Business dashboard (kept apart from the data access so it can be tested).

// How purchase statuses are read for money. These are stated on the dashboard so nobody has to guess:
//   committed = approved but not yet received (Approved, Ordered, In Transit)
//   spent     = received (Arrived in Shop, Completed)
const COMMITTED_STATUSES: PurchaseStatus[] = ['Approved', 'Ordered', 'In Transit']
const SPENT_STATUSES: PurchaseStatus[] = ['Arrived in Shop', 'Completed']
const AWAITING_APPROVAL: PurchaseStatus[] = ['Submitted', 'Under Review']
const AWAITING_RECEIPT: PurchaseStatus[] = ['Ordered', 'In Transit']

const requestTotal = (pr: PurchaseRequest) => (pr.items ?? []).reduce((sum, i) => sum + (i.unit_cost ?? 0) * i.quantity, 0)
const uncostedItems = (pr: PurchaseRequest) => (pr.items ?? []).filter((i) => i.unit_cost == null).length

export interface PurchasingOverview {
  total: number
  awaitingApproval: number
  approved: number
  awaitingReceipt: number
  received: number
  committedTotal: number
  spentTotal: number
  // items counted in the totals that have no cost entered (so the figures are a floor, not a guess)
  itemsWithoutCost: number
  recent: PurchaseRequest[]
  byStatus: { status: PurchaseStatus; count: number }[]
}

export function summarizePurchasing(requests: PurchaseRequest[]): PurchasingOverview {
  const inStatuses = (list: PurchaseStatus[]) => requests.filter((r) => list.includes(r.status))
  const counted = [...inStatuses(COMMITTED_STATUSES), ...inStatuses(SPENT_STATUSES)]
  const byStatus = new Map<PurchaseStatus, number>()
  for (const r of requests) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1)
  return {
    total: requests.length,
    awaitingApproval: inStatuses(AWAITING_APPROVAL).length,
    approved: requests.filter((r) => r.status === 'Approved').length,
    awaitingReceipt: inStatuses(AWAITING_RECEIPT).length,
    received: inStatuses(SPENT_STATUSES).length,
    committedTotal: inStatuses(COMMITTED_STATUSES).reduce((s, r) => s + requestTotal(r), 0),
    spentTotal: inStatuses(SPENT_STATUSES).reduce((s, r) => s + requestTotal(r), 0),
    itemsWithoutCost: counted.reduce((s, r) => s + uncostedItems(r), 0),
    recent: requests.slice(0, 5),
    byStatus: Array.from(byStatus, ([status, count]) => ({ status, count })),
  }
}

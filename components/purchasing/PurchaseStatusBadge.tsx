import StatusBadge from '@/components/ui/StatusBadge'
import type { PurchaseStatus } from '@/types/database'

export default function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  return <StatusBadge domain="purchase" value={status} />
}

export const ALL_PURCHASE_STATUSES: PurchaseStatus[] = [
  'Draft',
  'Submitted',
  'Under Review',
  'Approved',
  'Ordered',
  'In Transit',
  'Arrived in Shop',
  'Completed',
  'Rejected',
  'Cancelled',
]
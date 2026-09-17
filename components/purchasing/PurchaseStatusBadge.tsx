import Badge from '@/components/ui/Badge'
import type { PurchaseStatus } from '@/types/database'

const STATUS_TONE: Record<PurchaseStatus, Parameters<typeof Badge>[0]['tone']> = {
  Draft: 'slate',
  Submitted: 'sky',
  'Under Review': 'amber',
  Approved: 'emerald',
  Ordered: 'sky',
  'In Transit': 'sky',
  'Arrived in Shop': 'gold',
  Completed: 'emerald',
  Rejected: 'rose',
  Cancelled: 'rose',
}

export default function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{status}</Badge>
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

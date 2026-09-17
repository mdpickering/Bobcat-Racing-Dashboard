import Badge from '@/components/ui/Badge'
import type { CadReviewStatus } from '@/types/database'

const STATUS_TONE: Record<CadReviewStatus, Parameters<typeof Badge>[0]['tone']> = {
  Draft: 'slate',
  'Submitted for Review': 'sky',
  'Changes Requested': 'amber',
  Approved: 'emerald',
  'Approved for Manufacturing': 'gold',
}

export default function CadStatusBadge({ status }: { status: CadReviewStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{status}</Badge>
}

export const ALL_CAD_STATUSES: CadReviewStatus[] = ['Draft', 'Submitted for Review', 'Changes Requested', 'Approved', 'Approved for Manufacturing']

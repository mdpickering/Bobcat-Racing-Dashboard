import StatusBadge from '@/components/ui/StatusBadge'
import type { CadReviewStatus } from '@/types/database'

export default function CadStatusBadge({ status }: { status: CadReviewStatus }) {
  return <StatusBadge domain="cad" value={status} />
}

export const ALL_CAD_STATUSES: CadReviewStatus[] = ['Draft', 'Submitted for Review', 'Changes Requested', 'Approved', 'Approved for Manufacturing']
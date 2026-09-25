import type { PurchaseStatus } from '@/types/database'

// The next-step buttons on a purchase request, replacing the old status dropdown. This only decides
// which buttons to SHOW; who may actually make each change is still enforced by the database
// (row-level security, the approval function and the status trigger), exactly as before.
export interface StatusAction {
  id: string
  label: string
  // 'approve' runs the explicit approval (which also downloads the purchase sheet); 'status' sets the status.
  kind: 'approve' | 'status'
  to?: PurchaseStatus
  // 'manage' = cto/admin or the lead of the request's subsystem; 'approve' = cto/admin only.
  needs: 'manage' | 'approve'
  tone: 'primary' | 'secondary' | 'danger'
  confirm?: { title: string; body: string; confirmLabel: string; busyLabel: string }
}

const forward = (to: PurchaseStatus, label: string, needs: 'manage' | 'approve' = 'manage', tone: StatusAction['tone'] = 'primary'): StatusAction => ({
  id: `to-${to}`,
  label,
  kind: 'status',
  to,
  needs,
  tone,
})

const APPROVE: StatusAction = { id: 'approve', label: 'Approve Purchase', kind: 'approve', needs: 'approve', tone: 'primary' }

const REJECT: StatusAction = {
  id: 'reject',
  label: 'Reject',
  kind: 'status',
  to: 'Rejected',
  needs: 'approve',
  tone: 'danger',
  confirm: { title: 'Reject this purchase request?', body: 'It will be marked Rejected and the requester is notified. It can be returned to Draft afterwards.', confirmLabel: 'Reject', busyLabel: 'Rejecting…' },
}

const CANCEL: StatusAction = {
  id: 'cancel',
  label: 'Cancel request',
  kind: 'status',
  to: 'Cancelled',
  needs: 'manage',
  tone: 'danger',
  confirm: { title: 'Cancel this purchase request?', body: 'It will be marked Cancelled. It can be returned to Draft afterwards.', confirmLabel: 'Cancel request', busyLabel: 'Cancelling…' },
}

const BACK_TO_DRAFT = forward('Draft', 'Return to Draft', 'manage', 'secondary')

const NEXT: Record<PurchaseStatus, StatusAction[]> = {
  Draft: [forward('Submitted', 'Submit for review'), CANCEL],
  Submitted: [APPROVE, forward('Under Review', 'Move to Under Review', 'approve', 'secondary'), REJECT, BACK_TO_DRAFT, CANCEL],
  'Under Review': [APPROVE, REJECT, BACK_TO_DRAFT, CANCEL],
  Approved: [forward('Ordered', 'Mark Ordered'), CANCEL],
  Ordered: [forward('In Transit', 'Mark In Transit'), forward('Arrived in Shop', 'Mark Arrived in Shop', 'manage', 'secondary'), CANCEL],
  'In Transit': [forward('Arrived in Shop', 'Mark Arrived in Shop'), CANCEL],
  'Arrived in Shop': [forward('Completed', 'Mark Completed')],
  Completed: [],
  Rejected: [BACK_TO_DRAFT],
  Cancelled: [BACK_TO_DRAFT],
}

export function statusActions(status: PurchaseStatus, who: { canManage: boolean; canApprove: boolean }): StatusAction[] {
  return NEXT[status].filter((a) => (a.needs === 'approve' ? who.canApprove : who.canManage))
}

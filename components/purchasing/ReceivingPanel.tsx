'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PackageCheck } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import ReceiveButton from '@/components/receiving/ReceiveButton'
import { createClient } from '@/lib/supabase/client'
import { updatePurchaseRequest } from '@/lib/supabase/queries/purchasing'
import { getErrorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import type { PurchaseReceivingStatusRow, PurchaseRequestReceivingRow, PurchaseStatus } from '@/types/database'

interface ReceivingPanelProps {
  purchaseRequestId: string
  requestTitle: string
  requestStatus: PurchaseStatus
  lines: PurchaseReceivingStatusRow[]
  summary: PurchaseRequestReceivingRow | null
  canReceive: boolean
  canManage: boolean
}

const RECEIVABLE: PurchaseStatus[] = ['Ordered', 'In Transit', 'Arrived in Shop']

// Receiving lives beside purchasing, never inside it: this panel only reads purchase_receiving_status /
// purchase_request_receiving and calls receive_purchase_items(). Purchase status is changed only through the
// EXISTING purchasing status mutation (updatePurchaseRequest) — receiving never touches it automatically.
export default function ReceivingPanel({ purchaseRequestId, requestTitle, requestStatus, lines, summary, canReceive, canManage }: ReceivingPanelProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (lines.length === 0) return null

  const receivable = RECEIVABLE.includes(requestStatus)
  const suggestArrived = canManage && summary?.all_received && requestStatus === 'Ordered'

  async function markArrived() {
    setBusy(true)
    setError(null)
    try {
      await updatePurchaseRequest(createClient(), purchaseRequestId, { status: 'Arrived in Shop' })
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update the status.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
          <PackageCheck size={13} className="text-accent-blue" /> Receiving
        </h2>
        {canReceive && receivable && <ReceiveButton purchaseRequestId={purchaseRequestId} requestTitle={requestTitle} />}
      </div>

      {error && <p className="mb-2 text-status-danger">{error}</p>}

      <ul className="divide-y divide-border text-xs">
        {lines.map((l) => (
          <li key={l.item_id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <div className="font-medium text-text-primary">{l.description}</div>
              {l.last_received_on && <div className="text-[11px] text-text-muted">Last received {formatDate(l.last_received_on)}</div>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="neutral">Ordered {l.ordered_quantity}</Badge>
              <Badge tone="info">Accepted {l.accepted_quantity}</Badge>
              {l.rejected_quantity > 0 && <Badge tone="danger">Rejected {l.rejected_quantity}</Badge>}
              {l.fully_received ? <Badge tone="success">Fully received</Badge> : <Badge tone="warning">Outstanding {l.outstanding_quantity}</Badge>}
            </div>
          </li>
        ))}
      </ul>

      {suggestArrived && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-status-success/30 bg-status-success/10 px-3 py-2 text-xs">
          <span className="text-text-primary">Every line has been fully received.</span>
          <Button size="sm" disabled={busy} onClick={markArrived}>
            {busy ? 'Updating…' : 'Mark Arrived in Shop'}
          </Button>
        </div>
      )}
    </Panel>
  )
}

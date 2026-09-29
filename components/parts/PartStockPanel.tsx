'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeftRight, ArrowRight, ClipboardList, MinusCircle, PlusCircle, Warehouse } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import StockActionModal, { type StockActionMode } from '@/components/inventory/StockActionModal'
import { TRANSACTION_KIND_LABEL, TRANSACTION_KIND_TONE, formatUsd } from '@/lib/inventory'
import { formatDate, formatDateTime } from '@/lib/format'
import StatusBadge from '@/components/ui/StatusBadge'
import type { InventoryByLocationRow, InventoryOverviewRow, InventoryTransaction } from '@/types/database'

interface PartStockPanelProps {
  partId: string
  partLabel: string
  overview: InventoryOverviewRow | null
  byLocation: InventoryByLocationRow[]
  transactions: InventoryTransaction[]
  activeLocations: { id: string; name: string }[]
  canAdjust: boolean
  canManageInventory: boolean
}

// A compact summary on Part Detail — not a full inventory-management screen. The real screen is /inventory (or
// this part's own transaction history below); this panel is "how much, where, and what to do about it."
export default function PartStockPanel({ partId, partLabel, overview, byLocation, transactions, activeLocations, canAdjust, canManageInventory }: PartStockPanelProps) {
  const [action, setAction] = useState<StockActionMode | null>(null)
  const onHand = overview?.on_hand ?? 0
  const onOrder = overview?.on_order ?? 0
  const stockByLocation = byLocation.map((r) => ({ location_id: r.location_id, quantity_on_hand: r.quantity_on_hand }))

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
          <Warehouse size={13} className="text-accent-blue" /> Stock
        </h2>
        <Link href="/inventory" className="inline-flex items-center gap-1 text-[11px] text-accent-blue hover:underline">
          View inventory <ArrowRight size={11} aria-hidden="true" />
        </Link>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-text-muted">On hand</div>
          <div className="text-xl font-semibold tabular-nums text-text-primary">{onHand}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-text-muted">On order</div>
          <div className={`text-xl font-semibold tabular-nums ${onOrder > 0 ? 'text-status-info' : 'text-text-muted'}`}>{onOrder}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-text-muted">Stock value</div>
          <div className="text-xl font-semibold tabular-nums text-text-primary">{overview?.stock_value === null || overview?.stock_value === undefined ? '—' : formatUsd(overview.stock_value)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-text-muted">Last received</div>
          <div className="text-xs font-medium text-text-primary">{formatDate(overview?.last_received_on ?? null)}</div>
        </div>
      </div>

      {byLocation.length > 0 ? (
        <ul className="mb-3 divide-y divide-border rounded-lg border border-border text-xs">
          {byLocation.map((r) => (
            <li key={r.location_id} className={`flex items-center justify-between px-3 py-1.5 ${r.location_active ? '' : 'opacity-60'}`}>
              <span className="text-text-secondary">
                {r.location_name}
                {!r.location_active && <Badge tone="neutral" className="ml-1.5">Inactive</Badge>}
              </span>
              <span className="font-medium tabular-nums text-text-primary">{r.quantity_on_hand}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-[12px] text-text-muted">No stock on hand at any location.</p>
      )}

      {(canAdjust || canManageInventory) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {canAdjust && (
            <>
              <Button size="sm" variant="secondary" onClick={() => setAction('adjust')}>
                <PlusCircle size={12} /> Adjust
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setAction('transfer')}>
                <ArrowLeftRight size={12} /> Transfer
              </Button>
              <Button size="sm" variant="danger" onClick={() => setAction('write_off')}>
                <MinusCircle size={12} /> Write off
              </Button>
            </>
          )}
          {canManageInventory && (
            <Button size="sm" variant="secondary" onClick={() => setAction('opening_balance')}>
              <ClipboardList size={12} /> Opening balance
            </Button>
          )}
        </div>
      )}

      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-muted">Recent transactions</h3>
      {transactions.length === 0 ? (
        <p className="text-[12px] text-text-muted">No inventory transactions yet.</p>
      ) : (
        <ul className="divide-y divide-border text-[12px]">
          {transactions.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge tone={TRANSACTION_KIND_TONE[t.kind]}>{TRANSACTION_KIND_LABEL[t.kind]}</StatusBadge>
                  <span className="text-text-muted">{t.location?.name}</span>
                </div>
                {t.reason && <div className="mt-0.5 text-text-secondary">{t.reason}</div>}
                {t.notes && <div className="mt-0.5 text-text-muted">{t.notes}</div>}
                <div className="mt-0.5 text-[11px] text-text-muted">
                  {formatDateTime(t.created_at)} · {t.actor?.display_name || t.actor?.email || 'Unknown'}
                </div>
              </div>
              <span className={`flex-shrink-0 font-semibold tabular-nums ${t.quantity_delta > 0 ? 'text-status-success' : 'text-status-danger'}`}>
                {t.quantity_delta > 0 ? '+' : ''}
                {t.quantity_delta}
              </span>
            </li>
          ))}
        </ul>
      )}

      {action && (
        <StockActionModal
          open
          onClose={() => setAction(null)}
          mode={action}
          partId={partId}
          partLabel={partLabel}
          locations={activeLocations}
          stockByLocation={stockByLocation}
        />
      )}
    </Panel>
  )
}

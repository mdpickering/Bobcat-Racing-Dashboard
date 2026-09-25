import Panel from '@/components/ui/Panel'
import EmptyState from '@/components/ui/EmptyState'
import { History } from 'lucide-react'
import { formatDateTime } from '@/lib/format'
import type { PurchaseStatusHistory } from '@/types/database'

export default function PurchaseStatusHistoryPanel({ history }: { history: PurchaseStatusHistory[] }) {
  return (
    <Panel className="p-4">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">Status history</h2>
      {history.length === 0 ? (
        <EmptyState icon={History} title="No history yet" />
      ) : (
        <ol className="space-y-2.5">
          {history.map((h) => (
            <li key={h.id} className="flex items-start gap-2 text-xs">
              <div className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-ws" />
              <div className="min-w-0">
                <p className="text-text-primary">
                  {h.from_status ? (
                    <>
                      <span className="text-text-muted">{h.from_status}</span> → <span className="font-medium">{h.to_status}</span>
                    </>
                  ) : (
                    <span className="font-medium">Created as {h.to_status}</span>
                  )}
                </p>
                <p className="text-[11px] text-text-muted">
                  {h.changed_by_profile?.display_name || h.changed_by_profile?.email} · {formatDateTime(h.changed_at)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}

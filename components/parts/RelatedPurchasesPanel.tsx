import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { formatUsd } from '@/lib/parts'
import { formatDate } from '@/lib/format'

export interface RelatedLine {
  id: string
  description: string
  quantity: number
  unit_cost: number | null
  request: { id: string; title: string; status: string; created_at: string } | null
}

// Real purchasing activity only: order lines that were linked to this part or vendor through the catalog picker. Older
// free-text lines are never guessed at, so an empty list means "nothing has been linked yet", not "never bought".
export default function RelatedPurchasesPanel({ title, lines }: { title: string; lines: RelatedLine[] }) {
  return (
    <Panel className="p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-text-primary">
        <ShoppingCart size={13} className="text-accent-blue" /> {title}
      </h2>
      {lines.length === 0 ? (
        <p className="text-[12px] text-text-muted">No purchase lines have been linked to this record yet. Lines appear here when someone picks it from the catalog on a purchase request.</p>
      ) : (
        <ul className="divide-y divide-border text-xs">
          {lines.map((l) => (
            <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0">
                {l.request ? (
                  <Link href={`/purchasing/${l.request.id}`} className="font-medium text-text-primary hover:text-accent-blue">
                    {l.request.title}
                  </Link>
                ) : (
                  <span className="font-medium text-text-primary">Purchase request</span>
                )}
                <div className="text-2xs text-text-muted">
                  {l.description} · {l.request?.status ?? ''} {l.request ? `· ${formatDate(l.request.created_at)}` : ''}
                </div>
              </div>
              <div className="tabular-nums text-text-secondary">
                {l.quantity} × {formatUsd(l.unit_cost)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

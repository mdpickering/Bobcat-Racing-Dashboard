import Link from 'next/link'
import { ListChecks, Boxes, User, ShoppingCart, Ruler, SearchX } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import type { SearchResult, SearchResultType } from '@/lib/supabase/queries/search'

const TYPE_META: Record<SearchResultType, { label: string; icon: typeof ListChecks }> = {
  task: { label: 'Task', icon: ListChecks },
  subsystem: { label: 'Subsystem', icon: Boxes },
  person: { label: 'Person', icon: User },
  purchase_request: { label: 'Purchase Request', icon: ShoppingCart },
  cad_review: { label: 'CAD Review', icon: Ruler },
}

export default function SearchResultsList({ results }: { results: SearchResult[] }) {
  if (results.length === 0) {
    return <EmptyState icon={SearchX} title="No results" description="Try a different search term." />
  }

  return (
    <Panel className="overflow-hidden">
      <ul className="divide-y divide-border">
        {results.map((r) => {
          const meta = TYPE_META[r.type]
          const Icon = meta.icon
          return (
            <li key={`${r.type}-${r.id}`}>
              <Link href={r.href} className="flex items-center gap-3 px-4 py-3 text-xs transition-colors hover:bg-surface-raised">
                <Icon size={15} className="flex-shrink-0 text-text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-text-primary">{r.title}</div>
                  {r.subtitle && <div className="truncate text-[10px] text-text-muted">{r.subtitle}</div>}
                </div>
                <Badge tone="slate">{meta.label}</Badge>
              </Link>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

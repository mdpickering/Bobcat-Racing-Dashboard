import Link from 'next/link'
import Panel from '@/components/ui/Panel'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { timeAgo } from '@/lib/format'
import { Activity } from 'lucide-react'
import type { RecentActivityItem } from '@/lib/supabase/queries/admin'

const TYPE_LABEL: Record<RecentActivityItem['type'], string> = {
  task_request: 'Task Request',
  purchase_request: 'Purchasing',
  cad_review: 'CAD Review',
  member_application: 'Application',
}

export default function RecentActivityPanel({ items }: { items: RecentActivityItem[] }) {
  return (
    <Panel className="p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-text-primary">Recent Activity</h3>
      {items.length === 0 ? (
        <EmptyState icon={Activity} title="Nothing recent" description="New requests, applications, and reviews will show up here." />
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={`${item.type}-${item.id}`}>
              <Link href={item.href} className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-xs transition-colors hover:bg-surface-raised">
                <div className="min-w-0">
                  <span className="truncate font-medium text-text-primary">{item.title}</span>
                  <div className="mt-0.5 text-[10px] text-text-muted">
                    {TYPE_LABEL[item.type]} · {timeAgo(item.createdAt)}
                  </div>
                </div>
                <Badge tone="slate">{item.status}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

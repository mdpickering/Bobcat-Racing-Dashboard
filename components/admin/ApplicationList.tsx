import Link from 'next/link'
import { Inbox } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { formatDate } from '@/lib/format'
import type { MemberApplication } from '@/types/database'

const STATUS_TONE: Record<string, 'amber' | 'emerald' | 'rose'> = {
  pending: 'amber',
  approved: 'emerald',
  rejected: 'rose',
}

export default function ApplicationList({ applications }: { applications: MemberApplication[] }) {
  if (applications.length === 0) {
    return <EmptyState icon={Inbox} title="No applications match these filters" />
  }

  return (
    <Panel className="overflow-hidden">
      <ul className="divide-y divide-border">
        {applications.map((a) => (
          <li key={a.id}>
            <Link href={`/admin/applications/${a.id}`} className="flex items-center gap-3 px-4 py-3 text-xs transition-colors hover:bg-surface-raised">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-text-primary">{a.name}</div>
                <div className="mt-0.5 truncate text-[10px] text-text-muted">
                  {a.email} · Submitted {formatDate(a.submitted_at)}
                </div>
              </div>
              <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

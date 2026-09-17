import Link from 'next/link'
import Panel from '@/components/ui/Panel'
import EmptyState from '@/components/ui/EmptyState'
import type { TaskRequest } from '@/types/database'
import { Inbox } from 'lucide-react'

export default function PendingRequestsWidget({ requests }: { requests: TaskRequest[] }) {
  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wide text-text-primary">Pending Task Requests</h3>
        {requests.length > 0 && (
          <Link href="/tasks?tab=requests" className="text-[10px] font-mono uppercase text-accent-blue hover:underline">
            Review
          </Link>
        )}
      </div>
      {requests.length === 0 ? (
        <EmptyState icon={Inbox} title="No pending requests for your subsystem" />
      ) : (
        <ul className="space-y-1.5">
          {requests.slice(0, 5).map((r) => (
            <li key={r.id} className="rounded-lg px-2.5 py-2 text-xs hover:bg-surface-raised">
              <div className="truncate font-medium text-text-primary">{r.title}</div>
              <div className="mt-0.5 truncate text-[10px] text-text-muted">
                {r.requester?.display_name || r.requester?.email} · {r.subsystem?.name}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

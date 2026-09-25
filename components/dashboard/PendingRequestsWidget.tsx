import Link from 'next/link'
import type { TaskRequest } from '@/types/database'

// Task requests waiting on a team lead for their subsystem(s).
export default function PendingRequestsWidget({ requests }: { requests: TaskRequest[] }) {
  return (
    <section aria-label="Pending task requests">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">
          Task requests to review <span className="ml-1 text-xs font-normal text-text-muted">{requests.length}</span>
        </h3>
        <Link href="/tasks?tab=requests" className="text-xs text-accent-blue hover:underline">
          Review
        </Link>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {requests.slice(0, 5).map((r) => (
          <li key={r.id} className="px-3 py-2 text-xs">
            <div className="truncate font-medium text-text-primary">{r.title}</div>
            <div className="mt-0.5 truncate text-text-muted">
              {r.requester?.display_name || r.requester?.email} · {r.subsystem?.name}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
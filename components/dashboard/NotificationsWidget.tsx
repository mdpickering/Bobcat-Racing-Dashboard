import Panel from '@/components/ui/Panel'
import EmptyState from '@/components/ui/EmptyState'
import { timeAgo } from '@/lib/format'
import type { AppNotification } from '@/types/database'
import { BellRing } from 'lucide-react'

export default function NotificationsWidget({ notifications }: { notifications: AppNotification[] }) {
  return (
    <Panel className="p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-text-primary">Recent Notifications</h3>
      {notifications.length === 0 ? (
        <EmptyState icon={BellRing} title="Nothing new" description="Notifications will show up here." />
      ) : (
        <ul className="space-y-1.5">
          {notifications.slice(0, 5).map((n) => (
            <li key={n.id} className={`rounded-lg px-2.5 py-2 text-xs ${n.read_at ? 'opacity-60' : 'bg-accent-blue/5'}`}>
              <div className="truncate font-medium text-text-primary">{n.title}</div>
              <div className="mt-0.5 text-[10px] text-text-muted">{timeAgo(n.created_at)}</div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

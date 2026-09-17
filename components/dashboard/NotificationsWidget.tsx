import Link from 'next/link'
import Panel from '@/components/ui/Panel'
import EmptyState from '@/components/ui/EmptyState'
import { timeAgo } from '@/lib/format'
import { notificationHref } from '@/lib/notificationLinks'
import type { AppNotification } from '@/types/database'
import { BellRing } from 'lucide-react'

export default function NotificationsWidget({ notifications }: { notifications: AppNotification[] }) {
  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wide text-text-primary">Recent Notifications</h3>
        {notifications.length > 0 && (
          <Link href="/notifications" className="text-[10px] font-mono uppercase text-accent-blue hover:underline">
            View all
          </Link>
        )}
      </div>
      {notifications.length === 0 ? (
        <EmptyState icon={BellRing} title="Nothing new" description="Notifications will show up here." />
      ) : (
        <ul className="space-y-1.5">
          {notifications.slice(0, 5).map((n) => (
            <li key={n.id}>
              <Link
                href={notificationHref(n)}
                className={`block rounded-lg px-2.5 py-2 text-xs transition-colors hover:bg-surface-raised ${n.read_at ? 'opacity-60' : 'bg-accent-blue/5'}`}
              >
                <div className="truncate font-medium text-text-primary">{n.title}</div>
                <div className="mt-0.5 text-[10px] text-text-muted">{timeAgo(n.created_at)}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

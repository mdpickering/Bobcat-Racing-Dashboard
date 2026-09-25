import Link from 'next/link'
import { timeAgo } from '@/lib/format'
import { notificationHref } from '@/lib/notificationLinks'
import type { AppNotification } from '@/types/database'

export default function NotificationsWidget({ notifications }: { notifications: AppNotification[] }) {
  if (notifications.length === 0) return <p className="text-xs text-text-muted">Nothing new.</p>
  return (
    <ul className="-mx-2 space-y-0.5">
      {notifications.slice(0, 5).map((n) => (
        <li key={n.id}>
          <Link href={notificationHref(n)} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-surface-raised">
            <span aria-hidden="true" className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${n.read_at ? 'bg-transparent' : 'bg-status-info'}`} />
            <span className="min-w-0">
              <span className={`block truncate ${n.read_at ? 'text-text-secondary' : 'font-medium text-text-primary'}`}>
                {!n.read_at && <span className="sr-only">Unread: </span>}
                {n.title}
              </span>
              <span className="block text-text-muted">{timeAgo(n.created_at)}</span>
            </span>
          </Link>
        </li>
      ))}
      <li className="px-2 pt-1">
        <Link href="/notifications" className="text-xs text-accent-blue hover:underline">
          All notifications
        </Link>
      </li>
    </ul>
  )
}
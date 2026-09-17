'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { createClient } from '@/lib/supabase/client'
import { markNotificationRead, markAllNotificationsRead } from '@/lib/supabase/queries/notifications'
import { notificationHref } from '@/lib/notificationLinks'
import { timeAgo } from '@/lib/format'
import type { AppNotification } from '@/types/database'

export default function NotificationsList({ notifications }: { notifications: AppNotification[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)

  const unreadCount = notifications.filter((n) => !n.read_at).length

  async function handleClick(n: AppNotification) {
    if (!n.read_at) {
      setBusyId(n.id)
      const supabase = createClient()
      try {
        await markNotificationRead(supabase, n.id, true)
      } finally {
        setBusyId(null)
      }
    }
    router.push(notificationHref(n))
    router.refresh()
  }

  async function handleMarkAllRead() {
    const supabase = createClient()
    await markAllNotificationsRead(supabase)
    router.refresh()
  }

  if (notifications.length === 0) {
    return <EmptyState icon={Bell} title="No notifications yet" description="You're all caught up." />
  }

  return (
    <div className="space-y-3">
      {unreadCount > 0 && (
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" onClick={handleMarkAllRead}>
            <CheckCheck size={13} /> Mark all read
          </Button>
        </div>
      )}
      <Panel className="overflow-hidden">
        <ul className="divide-y divide-border">
          {notifications.map((n) => (
            <li key={n.id} className={n.read_at ? 'opacity-60' : 'bg-accent-blue/5'}>
              <button
                type="button"
                disabled={busyId === n.id}
                onClick={() => handleClick(n)}
                className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left text-xs transition-colors hover:bg-surface-raised"
              >
                <div className="min-w-0">
                  {!n.read_at && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-qu-gold align-middle" />}
                  <span className="font-semibold text-text-primary">{n.title}</span>
                  {n.message && <div className="mt-0.5 text-[11px] text-text-secondary">{n.message}</div>}
                  <div className="mt-1 text-[10px] text-text-muted">{timeAgo(n.created_at)}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}

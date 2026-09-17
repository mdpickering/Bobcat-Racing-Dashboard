'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { listNotifications, countUnreadNotifications, markNotificationRead, markAllNotificationsRead } from '@/lib/supabase/queries/notifications'
import type { AppNotification } from '@/types/database'
import EmptyState from '@/components/ui/EmptyState'
import { SkeletonList } from '@/components/ui/Skeleton'
import { timeAgo } from '@/lib/format'
import { notificationHref } from '@/lib/notificationLinks'

export default function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  async function refresh() {
    const supabase = createClient()
    try {
      const count = await countUnreadNotifications(supabase)
      setUnreadCount(count)
    } catch {
      // non-fatal — bell just shows no count
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function handleOpen() {
    const next = !open
    setOpen(next)
    if (next) {
      setLoading(true)
      const supabase = createClient()
      try {
        const data = await listNotifications(supabase, 10)
        setNotifications(data)
      } finally {
        setLoading(false)
      }
    }
  }

  async function handleMarkRead(id: string) {
    const supabase = createClient()
    await markNotificationRead(supabase, id, true)
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)))
    refresh()
  }

  async function handleMarkAllRead() {
    const supabase = createClient()
    await markAllNotificationsRead(supabase)
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
    setUnreadCount(0)
  }

  async function handleNotificationClick(n: AppNotification) {
    setOpen(false)
    if (!n.read_at) {
      const supabase = createClient()
      markNotificationRead(supabase, n.id, true).then(refresh)
    }
    router.push(notificationHref(n))
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Notifications"
        className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-qu-gold px-1 text-[9px] font-bold text-qu-navy">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-40 w-80 rounded-xl border border-border bg-surface-raised shadow-panel">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-xs font-bold text-text-primary">Notifications</span>
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wide text-text-muted hover:text-accent-blue"
            >
              <CheckCheck size={12} /> Mark all read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto scrollbar-thin p-2">
            {loading ? (
              <SkeletonList rows={3} />
            ) : notifications.length === 0 ? (
              <EmptyState title="No notifications yet" description="You're all caught up." />
            ) : (
              <ul className="space-y-1">
                {notifications.map((n) => (
                  <li key={n.id} className={`rounded-lg text-xs ${n.read_at ? 'opacity-60' : 'bg-accent-blue/5'}`}>
                    <div className="flex items-start justify-between gap-2 px-3 py-2">
                      <button type="button" onClick={() => handleNotificationClick(n)} className="min-w-0 flex-1 text-left">
                        <div className="truncate font-semibold text-text-primary">{n.title}</div>
                        {n.message && <div className="mt-0.5 line-clamp-2 text-[11px] text-text-secondary">{n.message}</div>}
                        <div className="mt-1 text-[10px] text-text-muted">{timeAgo(n.created_at)}</div>
                      </button>
                      {!n.read_at && (
                        <button
                          type="button"
                          onClick={() => handleMarkRead(n.id)}
                          className="shrink-0 text-[10px] font-mono uppercase text-accent-blue hover:underline"
                        >
                          Read
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-border p-2">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-1.5 text-center text-[10px] font-mono uppercase tracking-wide text-accent-blue hover:bg-surface"
            >
              View all
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

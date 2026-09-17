import { createClient } from '@/lib/supabase/server'
import { listNotifications } from '@/lib/supabase/queries/notifications'
import NotificationsList from '@/components/notifications/NotificationsList'
import ErrorState from '@/components/ui/ErrorState'

export default async function NotificationsPage() {
  const supabase = createClient()

  let notifications
  try {
    notifications = await listNotifications(supabase, 50)
  } catch {
    return <ErrorState message="Could not load your notifications." />
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Notifications</h1>
        <p className="mt-0.5 text-xs font-mono text-text-muted">Your last 50 notifications.</p>
      </div>
      <NotificationsList notifications={notifications} />
    </div>
  )
}

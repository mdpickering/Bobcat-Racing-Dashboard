import { createClient } from '@/lib/supabase/server'
import { listNotifications } from '@/lib/supabase/queries/notifications'
import NotificationsList from '@/components/notifications/NotificationsList'
import ErrorState from '@/components/ui/ErrorState'
import PageHeader from '@/components/ui/PageHeader'

export default async function NotificationsPage() {
  const supabase = createClient()

  let notifications
  try {
    notifications = await listNotifications(supabase, 50)
  } catch {
    return <ErrorState message="Could not load your notifications." />
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Notifications" description="Your last 50 notifications." />
      <NotificationsList notifications={notifications} />
    </div>
  )
}

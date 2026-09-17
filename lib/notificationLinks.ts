import type { AppNotification } from '@/types/database'

// Maps a notification's entity_type/entity_id (set by the automatic
// notification triggers in 0016_automatic_notifications.sql) to the page
// that shows that record. Falls back to the notifications list itself
// when there's nothing more specific to link to.
export function notificationHref(n: AppNotification): string {
  if (!n.entity_id) return '/notifications'
  switch (n.entity_type) {
    case 'task':
      return `/tasks/${n.entity_id}`
    case 'task_request':
      return '/tasks?tab=requests'
    case 'purchase_request':
      return `/purchasing/${n.entity_id}`
    case 'cad_review':
      return `/cad/${n.entity_id}`
    default:
      return '/notifications'
  }
}

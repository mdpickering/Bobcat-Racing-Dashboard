// NotificationBell (in the persistent app header) and NotificationsList
// (the full /notifications page) are independent client components with no
// shared state — the header never remounts across client-side navigation,
// so its unread count only ever reflects its own mount-time fetch plus its
// own mark-read actions. This event lets any surface that changes read
// state tell the bell to re-fetch its count, without introducing a full
// state-management layer for one counter.
export const NOTIFICATIONS_CHANGED_EVENT = 'bobcat:notifications-changed'

export function broadcastNotificationsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
}

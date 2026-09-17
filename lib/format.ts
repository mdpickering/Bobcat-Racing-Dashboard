export function timeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime()
  const diffSec = Math.round(diffMs / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  return new Date(isoDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDate(isoDate: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!isoDate) return '—'
  return new Date(isoDate).toLocaleDateString(undefined, opts ?? { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateTime(isoDate: string | null | undefined): string {
  if (!isoDate) return '—'
  return new Date(isoDate).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function isOverdue(deadline: string | null | undefined, status?: string): boolean {
  if (!deadline || status === 'Complete') return false
  return new Date(deadline).getTime() < Date.now()
}

export function isDueSoon(deadline: string | null | undefined, status?: string, withinDays = 7): boolean {
  if (!deadline || status === 'Complete') return false
  const time = new Date(deadline).getTime()
  const now = Date.now()
  return time >= now && time <= now + withinDays * 24 * 60 * 60 * 1000
}

export function daysUntil(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null
  const diff = new Date(isoDate).getTime() - Date.now()
  return Math.ceil(diff / (24 * 60 * 60 * 1000))
}

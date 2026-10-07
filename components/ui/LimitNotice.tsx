import Link from 'next/link'
import { MAX_LIST_LIMIT, nextListLimit } from '@/lib/pagination'

interface LimitNoticeProps {
  // what the list holds, plural: "tasks", "purchase requests"
  noun: string
  limit: number
  // the page's current search params, so "Show more" keeps every filter
  searchParams: { [key: string]: string | undefined }
  pathname: string
}

// Shown under a list that returned as many rows as it was allowed to. Server-rendered: "Show more" is a plain link.
export default function LimitNotice({ noun, limit, searchParams, pathname }: LimitNoticeProps) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) if (v && k !== 'limit') params.set(k, v)
  const atMax = limit >= MAX_LIST_LIMIT
  if (!atMax) params.set('limit', String(nextListLimit(limit)))
  const href = `${pathname}?${params.toString()}`
  return (
    <p className="mt-3 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs text-text-secondary" role="status">
      Showing the first {limit} {noun}.{' '}
      {atMax ? (
        'Narrow the filters to see the rest.'
      ) : (
        <Link href={href} className="font-medium text-accent-blue hover:underline">
          Show more
        </Link>
      )}
    </p>
  )
}

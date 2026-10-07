import Link from 'next/link'
import type { UpcomingItem } from '@/lib/supabase/queries/overview'

const DOT: Record<UpcomingItem['kind'], string> = {
  overdue: 'bg-status-danger',
  task: 'bg-status-info',
  event: 'bg-accent',
  milestone: 'bg-status-warning',
}

const KIND_LABEL: Record<UpcomingItem['kind'], string> = {
  overdue: 'Overdue task',
  task: 'Task',
  event: 'Event',
  milestone: 'Milestone',
}

// A short activity-style feed of what is overdue and what is coming in the next two weeks. The marker colour is
// paired with a text kind label, so it is never the only signal.
export default function UpcomingTimeline({ items }: { items: UpcomingItem[] }) {
  if (items.length === 0) return <p className="text-xs text-text-muted">Nothing overdue or scheduled in the next two weeks.</p>
  return (
    <ol className="relative space-y-3.5 before:absolute before:bottom-1 before:left-[4px] before:top-1 before:w-px before:bg-border">
      {items.map((item) => (
        <li key={item.key} className="relative pl-5">
          <span className={`absolute left-0 top-1.5 h-[9px] w-[9px] rounded-full ring-2 ring-surface ${DOT[item.kind]}`} aria-hidden="true" />
          <Link href={item.href} className="-my-1 block rounded-lg py-1 transition-colors hover:text-accent-blue">
            <span className="block truncate text-xs font-medium text-text-primary">{item.title}</span>
            <span className={`block truncate text-2xs ${item.kind === 'overdue' ? 'font-medium text-status-danger' : 'text-text-muted'}`}>
              {KIND_LABEL[item.kind]} · {item.detail}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  )
}

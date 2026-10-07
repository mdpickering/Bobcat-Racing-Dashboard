import Link from 'next/link'
import type { DashboardData } from '@/lib/supabase/queries/dashboard'

// The admin/CTO queue: what is waiting on someone across the whole organization. Only items with a page link out.
export default function OrgPendingWidget({ counts }: { counts: NonNullable<DashboardData['orgPendingCounts']> }) {
  const items: { label: string; value: number; href?: string }[] = [
    { label: 'Task requests', value: counts.taskRequests, href: '/tasks?tab=requests' },
    { label: 'Purchase approvals', value: counts.purchaseRequests, href: '/purchasing' },
    { label: 'Member applications', value: counts.memberApplications, href: '/admin/applications' },
    { label: 'Migration exceptions', value: counts.migrationExceptions },
  ]
  return (
    <section aria-label="Organization queue">
      <h3 className="mb-1.5 text-sm font-semibold text-text-primary">Waiting on you</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border p-3 sm:grid-cols-4">
        {items.map((i) => {
          const body = (
            <>
              <div className={`text-xl font-semibold tabular-nums ${i.value > 0 ? 'text-status-warning' : 'text-text-primary'}`}>{i.value}</div>
              <div className="text-xs text-text-muted">{i.label}</div>
            </>
          )
          return i.href ? (
            <Link key={i.label} href={i.href} className="touch-target block rounded-md transition-colors hover:text-accent-blue">
              {body}
            </Link>
          ) : (
            <div key={i.label}>{body}</div>
          )
        })}
      </div>
    </section>
  )
}
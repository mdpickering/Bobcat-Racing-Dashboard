import Link from 'next/link'
import Panel from '@/components/ui/Panel'
import type { DashboardData } from '@/lib/supabase/queries/dashboard'
import { ClipboardList, ShoppingCart, UserCheck, AlertOctagon } from 'lucide-react'

export default function OrgPendingWidget({ counts }: { counts: NonNullable<DashboardData['orgPendingCounts']> }) {
  // Only link to routes that exist yet — the rest are shown as plain
  // counts until their pages are built in a later chunk.
  const items: { label: string; value: number; href?: string; icon: typeof ClipboardList }[] = [
    { label: 'Task requests', value: counts.taskRequests, href: '/tasks?tab=requests', icon: ClipboardList },
    { label: 'Purchase approvals', value: counts.purchaseRequests, icon: ShoppingCart },
    { label: 'Member applications', value: counts.memberApplications, icon: UserCheck },
    { label: 'Migration exceptions', value: counts.migrationExceptions, icon: AlertOctagon },
  ]

  return (
    <Panel className="p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-text-primary">Operational Queue</h3>
      <ul className="grid grid-cols-2 gap-2">
        {items.map((item) => {
          const inner = (
            <>
              <item.icon size={14} className="text-accent-blue" />
              <div className="min-w-0">
                <div className="font-bold text-text-primary">{item.value}</div>
                <div className="truncate text-[10px] text-text-muted">{item.label}</div>
              </div>
            </>
          )
          const className = 'flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-xs transition-colors'
          return (
            <li key={item.label}>
              {item.href ? (
                <Link href={item.href} className={`${className} hover:bg-surface-raised`}>
                  {inner}
                </Link>
              ) : (
                <div className={className}>{inner}</div>
              )}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

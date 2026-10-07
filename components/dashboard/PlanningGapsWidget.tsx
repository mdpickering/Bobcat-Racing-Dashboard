import Link from 'next/link'
import { CircleCheck } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { STATUS_TEXT_CLASSES, type StatusTone } from '@/lib/status'

interface GapRow {
  label: string
  count: number
  href: string
  tone: StatusTone
}

// What the plan is missing: open tasks nobody owns, open tasks with no due date, and the worst overlap (overdue AND
// unowned). Each row is a link to the list that fixes it. Rows with nothing to fix disappear; when none are left the
// card says so, which is the point of showing it.
export default function PlanningGapsWidget({ rows, scopeLabel }: { rows: GapRow[]; scopeLabel: string }) {
  const open = rows.filter((r) => r.count > 0)
  return (
    <Panel className="p-4">
      <h2 className="text-sm font-semibold text-text-primary">Needs a deadline or an owner</h2>
      <p className="mt-0.5 text-xs text-text-secondary">{scopeLabel}</p>
      {open.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-status-success">
          <CircleCheck size={14} aria-hidden="true" /> Every open task has an owner and a deadline.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {open.map((r) => (
            <li key={r.label}>
              <Link href={r.href} className="touch-target -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-xs transition-colors hover:bg-surface-raised">
                <span className="text-text-primary">{r.label}</span>
                <span className="flex items-center gap-2">
                  <span className={`font-mono text-sm font-semibold tabular-nums ${STATUS_TEXT_CLASSES[r.tone]}`}>{r.count}</span>
                  <span className="text-accent-blue">Fix</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

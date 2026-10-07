import Link from 'next/link'
import Avatar from '@/components/ui/Avatar'
import type { SubsystemProgress } from '@/lib/supabase/queries/overview'

// Every subsystem as a card: real completion (finished tasks over all tasks), a progress meter, and the facts that
// need action (overdue, undated). Sorted by what needs attention first (see getTeamOverview).
export default function SubsystemProgressGrid({ subsystems }: { subsystems: SubsystemProgress[] }) {
  if (subsystems.length === 0) return <p className="text-xs text-text-muted">No subsystems yet.</p>
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {subsystems.map((s) => {
        const pct = s.total > 0 ? Math.round((s.complete / s.total) * 100) : 0
        return (
          <li key={s.id}>
            <Link
              href={`/subsystems/${s.id}`}
              className="block h-full rounded-2xl border border-border bg-surface p-4 shadow-panel transition duration-300 motion-safe:hover:-translate-y-0.5 hover:border-accent/40"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 text-sm font-semibold text-text-primary">{s.name}</span>
                <span className="font-mono text-sm font-semibold tabular-nums text-accent">{s.total > 0 ? `${pct}%` : '—'}</span>
              </div>
              <div
                className="mt-3 h-1.5 overflow-hidden rounded-full bg-text-secondary/15"
                role="progressbar"
                aria-label={`${s.name} completion`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
              >
                <div className="h-full rounded-full bg-gradient-to-r from-qu-gold to-amber-600" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div className="min-w-0 text-xs text-text-muted">
                  {s.total === 0 ? (
                    'No tasks yet'
                  ) : (
                    <>
                      <span className="text-text-secondary">{s.open} open</span>
                      {s.overdue > 0 && <span className="font-medium text-status-danger">{` · ${s.overdue} overdue`}</span>}
                      {s.noDeadline > 0 && <span>{` · ${s.noDeadline} no deadline`}</span>}
                      {s.unassigned > 0 && <span>{` · ${s.unassigned} no owner`}</span>}
                    </>
                  )}
                </div>
                {s.leads.length > 0 && (
                  <div className="flex flex-shrink-0 -space-x-1.5" aria-label={`Lead: ${s.leads.map((l) => l.name).join(', ')}`}>
                    {s.leads.slice(0, 3).map((l) => (
                      <span key={l.id} className="rounded-full ring-2 ring-surface" title={l.name}>
                        <Avatar name={l.name} src={l.avatarUrl} size={24} />
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

import { ClipboardCheck } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import type { SponsorshipLevel } from '@/types/database'

// One deliverable as it will be tracked. Status, assignee, due date and completion are switched on by the deliverables
// update (migration 0035); until then every row is the standard checklist item with nothing recorded against it, and
// this panel says so rather than showing invented progress.
export interface DeliverableRow {
  id: string
  title: string
  status: 'not_started' | 'in_progress' | 'done' | null
  assignee: string | null
  dueDate: string | null
  completedAt: string | null
  completedBy: string | null
}

const STATUS_LABEL = { not_started: 'Not started', in_progress: 'In progress', done: 'Done' } as const

export default function DeliverablesPanel({ level, tracked = false }: { level: SponsorshipLevel | null; tracked?: boolean }) {
  const rows: DeliverableRow[] = (level?.deliverables ?? []).map((d) => ({ id: d.id, title: d.title, status: null, assignee: null, dueDate: null, completedAt: null, completedBy: null }))

  return (
    <Panel className="p-4">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-text-primary">
        <ClipboardCheck size={13} className="text-accent-blue" /> Deliverables
      </h2>
      {!level ? (
        <p className="text-[12px] text-text-muted">Deliverables follow the sponsorship level. Once a standard level is set, its deliverables are listed here.</p>
      ) : (
        <>
          <p className="mb-3 text-[12px] text-text-muted">Standard deliverables for {level.name}.</p>
          {!tracked && (
            <p className="mb-3 rounded-lg border border-border px-3 py-2 text-[12px] text-text-muted">
              Status, assigned Business member, due date and completion are not tracked yet — they arrive with the deliverables update. The checklist below is what each {level.name} sponsor receives.
            </p>
          )}
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[11px] font-medium uppercase tracking-wide text-text-muted">
                  <th className="py-2 pr-2 font-medium">Deliverable</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Assigned to</th>
                  <th className="px-2 py-2 font-medium">Due</th>
                  <th className="py-2 pl-2 font-medium">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-2 text-text-primary">{r.title}</td>
                    <td className="px-2 py-2 text-text-muted">{r.status ? STATUS_LABEL[r.status] : '—'}</td>
                    <td className="px-2 py-2 text-text-muted">{r.assignee ?? '—'}</td>
                    <td className="px-2 py-2 text-text-muted">{r.dueDate ?? '—'}</td>
                    <td className="py-2 pl-2 text-text-muted">{r.completedAt ? `${r.completedAt}${r.completedBy ? ` · ${r.completedBy}` : ''}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  )
}

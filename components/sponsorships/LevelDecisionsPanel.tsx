import { Scale } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Badge from '@/components/ui/Badge'
import { DECISION_METHOD_LABEL, formatMoney } from '@/lib/sponsorships'
import { formatDateTime } from '@/lib/format'
import type { SponsorshipLevelDecision } from '@/types/database'

const TONE = { qualified: 'emerald', exception: 'sky', custom: 'slate', historical_unassigned: 'slate' } as const

// Every level ever recorded, newest first, with the basis it was decided on. Decisions are permanent: this is the
// answer to "why does this sponsor hold this level".
export default function LevelDecisionsPanel({ decisions, currentDecisionId }: { decisions: SponsorshipLevelDecision[]; currentDecisionId: string | null }) {
  return (
    <Panel className="p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-text-primary">
        <Scale size={13} className="text-accent-blue" /> Level decision history
      </h2>
      {decisions.length === 0 ? (
        <p className="text-[12px] text-text-muted">No level has been decided yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {decisions.map((d) => (
            <li key={d.id} className="py-3 text-xs first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-text-primary">{d.level?.name ?? (d.method === 'custom' ? 'Custom sponsorship' : 'No level assigned')}</span>
                <Badge tone={TONE[d.method]}>{DECISION_METHOD_LABEL[d.method]}</Badge>
                {d.id === currentDecisionId && <Badge tone="gold">Current</Badge>}
              </div>
              <div className="mt-1 text-[12px] text-text-secondary">
                Basis: {formatMoney(d.basis_cash)} cash + {formatMoney(d.basis_in_kind)} in-kind = <span className="text-text-primary">{formatMoney(d.basis_total)}</span>
                {d.threshold != null && <> · minimum {formatMoney(d.threshold)}</>}
              </div>
              {d.reason && <p className="mt-1 whitespace-pre-wrap text-[12px] text-text-secondary">“{d.reason}”</p>}
              <div className="mt-1 text-[11px] text-text-muted">
                {formatDateTime(d.decided_at)}
                {d.decider ? ` · ${d.decider.display_name || d.decider.email}` : ' · imported'}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

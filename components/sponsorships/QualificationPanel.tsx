'use client'

import { useState } from 'react'
import { Award } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import SetLevelModal from './SetLevelModal'
import { LevelBadge, ReviewBadge } from './SponsorshipBadges'
import { DECISION_METHOD_LABEL, REVIEW_FLAG_LABEL, formatMoney, qualify } from '@/lib/sponsorships'
import type { SponsorshipLevel, SponsorshipLevelDecision, SponsorshipLevelReview, SponsorshipSummary } from '@/types/database'

interface QualificationPanelProps {
  sponsorshipId: string
  summary: SponsorshipSummary
  review: SponsorshipLevelReview | null
  levels: SponsorshipLevel[]
  currentDecision: SponsorshipLevelDecision | null
  customTerms: string | null
  canManage: boolean
}

const Row = ({ label, value, strong = false, muted = false }: { label: string; value: string; strong?: boolean; muted?: boolean }) => (
  <div className={`flex justify-between gap-3 ${strong ? 'border-t border-border pt-1.5 font-semibold text-text-primary' : muted ? 'text-text-muted' : 'text-text-secondary'}`}>
    <span>{label}</span>
    <span className="tabular-nums text-text-primary">{value}</span>
  </div>
)

// Current level, the arithmetic behind it, and the cash position. Everything shown here comes from the database's
// derived views; the only action is "Set level", which goes through set_sponsorship_level().
export default function QualificationPanel({ sponsorshipId, summary, review, levels, currentDecision, customTerms, canManage }: QualificationPanelProps) {
  const [open, setOpen] = useState(false)
  const currentLevel = levels.find((l) => l.id === summary.level_id) ?? null
  const q = qualify(summary.cash_committed, summary.in_kind_value, currentLevel)
  const flag = review?.review_flag

  return (
    <Panel className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
          <Award size={13} className="text-accent-blue" /> Level and value
        </h2>
        {canManage && (
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            {summary.level_id || currentDecision ? 'Change level' : 'Set level'}
          </Button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <LevelBadge name={summary.level_name} />
        {currentDecision && <span className="text-[12px] text-text-muted">{DECISION_METHOD_LABEL[currentDecision.method]}</span>}
        <ReviewBadge flag={flag} quietWhenOk />
      </div>
      {flag && flag !== 'ok' && <p className="mb-3 text-[12px] text-text-muted">{REVIEW_FLAG_LABEL[flag].help}</p>}
      {flag === 'qualifies_higher' && review?.suggested_level_name && (
        <p className="mb-3 text-[12px] text-status-warning">
          The current qualifying value of {formatMoney(review.qualifying_value)} reaches {review.suggested_level_name}.
        </p>
      )}
      {customTerms && (
        <div className="mb-3 rounded-lg border border-border p-3 text-[12px]">
          <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Custom terms</div>
          <p className="mt-1 whitespace-pre-wrap text-text-secondary">{customTerms}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 text-xs">
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Qualifying value</div>
          <Row label="Cash committed" value={formatMoney(summary.cash_committed)} />
          <Row label="+ In-kind (estimated)" value={formatMoney(summary.in_kind_value)} />
          <Row label="Total sponsorship value" value={formatMoney(summary.total_sponsorship_value)} strong />
          {currentLevel && (
            <>
              <Row label={`${currentLevel.name} minimum`} value={formatMoney(currentLevel.min_amount)} muted />
              <div className={`text-[12px] ${q.qualifies ? 'text-status-success' : 'text-status-warning'}`}>
                {q.qualifies ? 'Currently meets this minimum.' : `Currently ${formatMoney(q.shortfall)} below this minimum.`}
              </div>
            </>
          )}
          {currentDecision && (
            <div className="pt-1 text-[12px] text-text-muted">
              Basis when the level was set: {formatMoney(currentDecision.basis_cash)} cash + {formatMoney(currentDecision.basis_in_kind)} in-kind = {formatMoney(currentDecision.basis_total)}.
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Cash position</div>
          <Row label="Committed" value={formatMoney(summary.cash_committed)} />
          <Row label="Received" value={formatMoney(summary.cash_received)} />
          <Row label="Outstanding" value={formatMoney(summary.cash_outstanding)} strong />
          {summary.cash_over_received > 0 && <Row label="Received over committed" value={formatMoney(summary.cash_over_received)} muted />}
          {summary.cash_refunded > 0 && <Row label="Refunded (already deducted)" value={formatMoney(summary.cash_refunded)} muted />}
          <div className="pt-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">Where the received cash is</div>
          <Row label="Available to the team" value={formatMoney(summary.cash_available)} muted />
          <Row label="Held by the university" value={formatMoney(summary.cash_held_by_university)} muted />
          <Row label="Availability unknown" value={formatMoney(summary.cash_availability_unknown)} muted />
        </div>
      </div>

      {canManage && (
        <SetLevelModal
          open={open}
          onClose={() => setOpen(false)}
          sponsorshipId={sponsorshipId}
          levels={levels}
          currentLevelId={summary.level_id}
          cashCommitted={summary.cash_committed}
          inKindValue={summary.in_kind_value}
        />
      )}
    </Panel>
  )
}

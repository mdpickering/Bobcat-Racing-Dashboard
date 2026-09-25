import Badge from '@/components/ui/Badge'
import StatusBadge from '@/components/ui/StatusBadge'
import { REVIEW_FLAG_LABEL, STAGE_LABEL } from '@/lib/sponsorships'
import { statusTone } from '@/lib/status'
import type { LevelReviewFlag, SponsorshipStage } from '@/types/database'

// Stage and review colours come from the shared status registry (lib/status.ts).
export function StageBadge({ stage }: { stage: SponsorshipStage }) {
  return <StatusBadge tone={statusTone('sponsorshipStage', stage)}>{STAGE_LABEL[stage]}</StatusBadge>
}

// "OK" is the quiet default; only things that need a look, or explain why there is no level, are shown loudly.
export function ReviewBadge({ flag, quietWhenOk = false }: { flag: LevelReviewFlag | null | undefined; quietWhenOk?: boolean }) {
  if (!flag) return null
  if (quietWhenOk && flag === 'ok') return null
  const info = REVIEW_FLAG_LABEL[flag]
  return (
    <span title={info.help}>
      <StatusBadge tone={statusTone('levelReview', flag)}>{info.label}</StatusBadge>
    </span>
  )
}

// A level is brand emphasis (gold), never a status.
export function LevelBadge({ name }: { name: string | null | undefined }) {
  return name ? <Badge tone="brand">{name}</Badge> : <span className="text-text-muted">—</span>
}

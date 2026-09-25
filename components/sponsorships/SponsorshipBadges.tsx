import Badge from '@/components/ui/Badge'
import { REVIEW_FLAG_LABEL, STAGE_LABEL, STAGE_TONE } from '@/lib/sponsorships'
import type { LevelReviewFlag, SponsorshipStage } from '@/types/database'

export function StageBadge({ stage }: { stage: SponsorshipStage }) {
  return <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>
}

// "OK" is the quiet default; only things that need a look, or explain why there is no level, are shown loudly.
export function ReviewBadge({ flag, quietWhenOk = false }: { flag: LevelReviewFlag | null | undefined; quietWhenOk?: boolean }) {
  if (!flag) return null
  if (quietWhenOk && flag === 'ok') return null
  const info = REVIEW_FLAG_LABEL[flag]
  return (
    <span title={info.help}>
      <Badge tone={info.tone}>{info.label}</Badge>
    </span>
  )
}

export function LevelBadge({ name }: { name: string | null | undefined }) {
  return name ? <Badge tone="gold">{name}</Badge> : <span className="text-text-muted">—</span>
}

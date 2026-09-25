import { STATUS_TONE_CLASSES, type StatusTone } from '@/lib/status'

// The original tone names are still accepted so existing pages keep working; they now resolve to the shared status
// tones (lib/status.ts) so the same meaning has the same colour in every workspace and both themes.
type LegacyTone = 'emerald' | 'gold' | 'rose' | 'sky' | 'slate' | 'amber'
type BadgeTone = StatusTone | LegacyTone

const LEGACY: Record<LegacyTone, StatusTone> = {
  emerald: 'success',
  amber: 'warning',
  rose: 'danger',
  sky: 'info',
  slate: 'neutral',
  gold: 'brand',
}

interface BadgeProps {
  tone?: BadgeTone
  children: React.ReactNode
  className?: string
}

export default function Badge({ tone = 'neutral', children, className = '' }: BadgeProps) {
  const resolved: StatusTone = tone in LEGACY ? LEGACY[tone as LegacyTone] : (tone as StatusTone)
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STATUS_TONE_CLASSES[resolved]} ${className}`}
    >
      {children}
    </span>
  )
}

import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import { STATUS_TEXT_CLASSES, type StatusTone } from '@/lib/status'

interface KpiCardProps {
  label: string
  value: string
  // short, factual context under the figure (never an invented trend)
  hint?: string
  hintTone?: StatusTone
  tone?: StatusTone
  href?: string
}

// One headline figure as a floating widget: label, a large mono number, and a small status pill. The whole card is the
// link when there is one, so it is a single large tap target.
export default function KpiCard({ label, value, hint, hintTone = 'neutral', tone, href }: KpiCardProps) {
  const body = (
    <div className="group relative h-full overflow-hidden rounded-2xl border border-border bg-surface p-3 shadow-panel sm:p-4 transition duration-300 motion-safe:hover:-translate-y-0.5 hover:border-accent/40">
      <div className="text-xs font-medium text-text-muted">{label}</div>
      <div className={`mt-1.5 font-mono text-2xl sm:text-3xl font-semibold leading-none tabular-nums ${tone ? STATUS_TEXT_CLASSES[tone] : 'text-text-primary'}`}>{value}</div>
      {hint && (
        <div className="mt-2.5 sm:mt-3">
          <Badge tone={hintTone} className="max-w-full truncate !normal-case !tracking-normal !font-medium">
            {hint}
          </Badge>
        </div>
      )}
    </div>
  )
  return href ? (
    <Link href={href} className="block rounded-2xl">
      {body}
    </Link>
  ) : (
    body
  )
}

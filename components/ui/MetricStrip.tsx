import Link from 'next/link'
import { STATUS_TEXT_CLASSES, type StatusTone } from '@/lib/status'

export interface Metric {
  label: string
  // pass a formatted string; use '—' only for a figure that genuinely has no value, never as a stand-in for data
  value: string
  hint?: string
  tone?: StatusTone
  href?: string
}

// The primary figures of a page as one unboxed row (24px values, 11px labels): hierarchy by type and spacing rather
// than four bordered cards. Two columns on phones. Valid description-list markup: each metric is a <div> group of
// one term and one description; a link, when there is one, lives inside the description.
export default function MetricStrip({ metrics, className = '' }: { metrics: Metric[]; className?: string }) {
  return (
    <dl className={`grid grid-cols-2 gap-x-6 gap-y-4 border-b border-border pb-5 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] ${className}`}>
      {metrics.map((m) => {
        const value = <span className={`text-2xl font-semibold tabular-nums leading-8 ${m.tone ? STATUS_TEXT_CLASSES[m.tone] : 'text-text-primary'}`}>{m.value}</span>
        return (
          <div key={m.label}>
            <dt className="text-2xs font-medium text-text-muted">{m.label}</dt>
            <dd className="mt-1">
              {m.href ? (
                <Link href={m.href} className="touch-target block rounded-md transition-colors hover:opacity-80">
                  {value}
                </Link>
              ) : (
                value
              )}
              {m.hint && <span className="mt-0.5 block text-xs text-text-muted">{m.hint}</span>}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

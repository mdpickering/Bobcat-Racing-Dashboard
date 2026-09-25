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
// than four bordered cards. Two columns on phones.
export default function MetricStrip({ metrics, className = '' }: { metrics: Metric[]; className?: string }) {
  return (
    <dl className={`grid grid-cols-2 gap-x-6 gap-y-4 border-b border-border pb-5 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] ${className}`}>
      {metrics.map((m) => {
        const body = (
          <>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{m.label}</dt>
            <dd className={`mt-1 text-2xl font-semibold tabular-nums leading-8 ${m.tone ? STATUS_TEXT_CLASSES[m.tone] : 'text-text-primary'}`}>{m.value}</dd>
            {m.hint && <div className="mt-0.5 text-xs text-text-muted">{m.hint}</div>}
          </>
        )
        return m.href ? (
          <Link key={m.label} href={m.href} className="block rounded-lg transition-colors hover:text-accent-blue">
            {body}
          </Link>
        ) : (
          <div key={m.label}>{body}</div>
        )
      })}
    </dl>
  )
}

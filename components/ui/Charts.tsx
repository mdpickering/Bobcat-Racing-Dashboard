import Link from 'next/link'
import { STATUS_TONE_CLASSES, type StatusTone } from '@/lib/status'

// Plain, dependency-free charts. They are rendered only when there is real data (the caller decides), always carry
// their values as text, and never rely on colour alone.

export interface BarItem {
  label: string
  value: number
  // what to print for the value (e.g. "$3,500" or "4"); defaults to the number
  display?: string
  href?: string
}

// Horizontal bars for comparing a handful of categories (sponsors by level, purchases by status).
export function BarList({ items, ariaLabel }: { items: BarItem[]; ariaLabel: string }) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <ul aria-label={ariaLabel} className="space-y-2.5">
      {items.map((i) => {
        const row = (
          <div>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate text-text-secondary">{i.label}</span>
              <span className="flex-shrink-0 font-medium tabular-nums text-text-primary">{i.display ?? String(i.value)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-raised" aria-hidden="true">
              <div className="h-full rounded-full bg-ws" style={{ width: `${Math.max((i.value / max) * 100, i.value > 0 ? 3 : 0)}%` }} />
            </div>
          </div>
        )
        return (
          <li key={i.label}>
            {i.href ? (
              <Link href={i.href} className="block rounded-md transition-colors hover:text-accent-blue">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        )
      })}
    </ul>
  )
}

// One measure against a total (cash received of cash committed).
export function ProgressBar({ value, total, label, valueLabel, tone = 'success' }: { value: number; total: number; label: string; valueLabel: string; tone?: StatusTone }) {
  const pct = total > 0 ? Math.min(Math.round((value / total) * 100), 100) : 0
  const fill = STATUS_TONE_CLASSES[tone].split(' ').find((c) => c.startsWith('text-')) ?? 'text-status-success'
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-text-secondary">{label}</span>
        <span className="tabular-nums text-text-primary">
          {valueLabel} <span className="text-text-muted">({pct}%)</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-raised"
      >
        <div className={`h-full rounded-full bg-current ${fill}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

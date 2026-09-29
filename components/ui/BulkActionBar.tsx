'use client'

import { X } from 'lucide-react'
import Button from './Button'

interface BulkActionBarProps {
  count: number
  onClear: () => void
  children: React.ReactNode
}

// A sticky bar that appears once at least one row is selected. Generic on purpose: the deadline
// bulk-reschedule (Operations → Deadlines) is the first use, but the shape supports a future bulk
// status/owner change without a new component — just different children.
export default function BulkActionBar({ count, onClear, children }: BulkActionBarProps) {
  if (count === 0) return null
  return (
    <div className="sticky bottom-4 z-30 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-raised px-4 py-3 shadow-panel">
      <span className="whitespace-nowrap text-xs font-semibold text-text-primary">{count} selected</span>
      {children}
      <Button size="sm" variant="ghost" onClick={onClear}>
        <X size={12} /> Clear
      </Button>
    </div>
  )
}

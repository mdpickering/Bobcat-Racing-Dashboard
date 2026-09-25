import { Lock } from 'lucide-react'

// Shown instead of silently missing buttons when someone can see a page but not change it.
export default function ReadOnlyNotice({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs text-text-secondary">
      <Lock size={14} className="mt-0.5 flex-shrink-0 text-text-muted" aria-hidden="true" />
      <span>{children ?? 'You can view this page but not change it.'}</span>
    </div>
  )
}

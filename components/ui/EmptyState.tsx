import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
      {Icon && <Icon size={22} className="mb-1 text-text-muted" />}
      <p className="text-xs font-semibold text-text-secondary">{title}</p>
      {description && <p className="max-w-xs text-[11px] text-text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

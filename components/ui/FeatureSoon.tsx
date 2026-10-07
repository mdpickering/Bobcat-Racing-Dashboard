import type { LucideIcon } from 'lucide-react'

interface FeatureSoonProps {
  icon: LucideIcon
  title: string
  description: string
}

// For a feature that is planned but not built. It states that plainly and shows no data, numbers or controls.
export default function FeatureSoon({ icon: Icon, title, description }: FeatureSoonProps) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-14 text-center">
      <Icon size={22} className="text-text-muted" aria-hidden="true" />
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      <p className="text-xs text-text-secondary">{description}</p>
      <span className="rounded-full border border-border px-2.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-text-muted">Not built yet</span>
    </div>
  )
}

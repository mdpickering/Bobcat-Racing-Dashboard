interface SectionHeaderProps {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  as?: 'h2' | 'h3'
}

// 14px semibold, sentence case: hierarchy from type, not from another box.
export default function SectionHeader({ title, description, actions, as: Tag = 'h2' }: SectionHeaderProps) {
  return (
    <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <Tag className="text-sm font-semibold text-text-primary">{title}</Tag>
        {description && <p className="mt-0.5 text-xs text-text-secondary">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

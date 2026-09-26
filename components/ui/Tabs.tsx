import Link from 'next/link'

export interface TabItem {
  label: string
  href: string
  active: boolean
  count?: number
}

// Link-based tabs (each tab is a real URL, so it can be bookmarked and works without client state).
export default function Tabs({ tabs, label }: { tabs: TabItem[]; label: string }) {
  return (
    <nav aria-label={label} className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border scrollbar-thin">
      {tabs.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          aria-current={t.active ? 'page' : undefined}
          className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
            t.active ? 'border-ws text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          {t.label}
          {t.count !== undefined && <span className="rounded-full bg-surface-raised px-1.5 text-[11px] text-text-muted">{t.count}</span>}
        </Link>
      ))}
    </nav>
  )
}

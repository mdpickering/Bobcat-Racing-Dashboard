import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import Panel from '@/components/ui/Panel'

interface StatCardProps {
  label: string
  value: number | string
  icon: LucideIcon
  href?: string
  tone?: 'default' | 'warning' | 'danger'
}

const TONE_CLASSES: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'text-accent-blue bg-accent-blue/10',
  warning: 'text-amber-400 bg-amber-500/10',
  danger: 'text-rose-400 bg-rose-500/10',
}

export default function StatCard({ label, value, icon: Icon, href, tone = 'default' }: StatCardProps) {
  const content = (
    <Panel className="flex items-center gap-3 p-4 transition-colors hover:border-accent-blue/40">
      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${TONE_CLASSES[tone]}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <div className="text-lg font-bold leading-none text-text-primary">{value}</div>
        <div className="mt-1 truncate text-[10px] font-mono uppercase tracking-wide text-text-muted">{label}</div>
      </div>
    </Panel>
  )
  return href ? <Link href={href}>{content}</Link> : content
}

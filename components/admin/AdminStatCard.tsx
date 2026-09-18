import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import Panel from '@/components/ui/Panel'

interface AdminStatCardProps {
  label: string
  value: number
  icon: LucideIcon
  href?: string
  tone?: 'default' | 'warning'
}

export default function AdminStatCard({ label, value, icon: Icon, href, tone = 'default' }: AdminStatCardProps) {
  const content = (
    <Panel className={`flex items-center gap-3 p-4 transition-colors hover:border-accent-blue/40 ${tone === 'warning' && value > 0 ? 'border-amber-500/30' : ''}`}>
      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${tone === 'warning' && value > 0 ? 'bg-amber-500/10 text-amber-400' : 'bg-accent-blue/10 text-accent-blue'}`}>
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

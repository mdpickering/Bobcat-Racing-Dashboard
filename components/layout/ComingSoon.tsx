import type { LucideIcon } from 'lucide-react'
import Panel from '@/components/ui/Panel'

export default function ComingSoon({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
      <Panel className="flex h-14 w-14 items-center justify-center rounded-2xl">
        <Icon size={24} className="text-accent-blue" />
      </Panel>
      <h1 className="text-base font-bold text-text-primary">{title}</h1>
      <p className="text-xs text-text-muted">{description}</p>
      <p className="text-[10px] font-mono uppercase tracking-widest text-text-muted">Coming in a later phase</p>
    </div>
  )
}

import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'
import Panel from '@/components/ui/Panel'

export default function PurchasingWidget({ pendingCount, subsystemCount }: { pendingCount: number; subsystemCount: number }) {
  if (pendingCount === 0) return null

  return (
    <Link href="/purchasing">
      <Panel className="flex items-center gap-3 p-4 text-xs transition-colors hover:border-accent-blue/40">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent-blue/10 text-accent-blue">
          <ShoppingCart size={16} />
        </div>
        <span className="text-text-secondary">
          <strong className="text-text-primary">{pendingCount}</strong> purchase request{pendingCount === 1 ? '' : 's'} awaiting review in your
          subsystem{subsystemCount === 1 ? '' : 's'}
        </span>
      </Panel>
    </Link>
  )
}

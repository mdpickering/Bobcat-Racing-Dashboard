import Link from 'next/link'

export default function PurchasingWidget({ pendingCount, subsystemCount }: { pendingCount: number; subsystemCount: number }) {
  if (pendingCount === 0) return null
  return (
    <Link href="/purchasing" className="block text-xs text-text-secondary transition-colors hover:text-text-primary">
      <strong className="text-text-primary">{pendingCount}</strong> purchase request{pendingCount === 1 ? '' : 's'} awaiting review in your subsystem
      {subsystemCount === 1 ? '' : 's'} <span className="text-accent-blue">→</span>
    </Link>
  )
}
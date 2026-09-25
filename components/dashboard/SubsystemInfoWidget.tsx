import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import type { SubsystemMember } from '@/types/database'

export default function SubsystemInfoWidget({ memberships }: { memberships: SubsystemMember[] }) {
  if (memberships.length === 0) return <p className="text-xs text-text-muted">You are not assigned to a subsystem yet.</p>
  return (
    <ul className="-mx-2 space-y-0.5">
      {memberships.map((m) => (
        <li key={m.subsystem_id}>
          <Link href={`/subsystems/${m.subsystem_id}`} className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-surface-raised">
            <span className="font-medium text-text-primary">{m.subsystem?.name ?? m.subsystem_id}</span>
            {m.is_lead && <Badge tone="gold">Lead</Badge>}
          </Link>
        </li>
      ))}
    </ul>
  )
}
import Link from 'next/link'
import Panel from '@/components/ui/Panel'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import type { SubsystemMember } from '@/types/database'
import { Boxes } from 'lucide-react'

export default function SubsystemInfoWidget({ memberships }: { memberships: SubsystemMember[] }) {
  return (
    <Panel className="p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-text-primary">Your Subsystems</h3>
      {memberships.length === 0 ? (
        <EmptyState icon={Boxes} title="Not assigned to a subsystem yet" />
      ) : (
        <ul className="space-y-1.5">
          {memberships.map((m) => (
            <li key={m.subsystem_id}>
              <Link
                href={`/subsystems/${m.subsystem_id}`}
                className="flex items-center justify-between rounded-lg border border-transparent px-2.5 py-2 text-xs transition-colors hover:border-border hover:bg-surface-raised"
              >
                <span className="font-medium text-text-primary">{m.subsystem?.name ?? m.subsystem_id}</span>
                {m.is_lead && <Badge tone="gold">Lead</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

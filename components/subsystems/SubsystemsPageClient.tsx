'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Boxes, ChevronRight, Plus } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import CreateSubsystemModal from './CreateSubsystemModal'
import type { Subsystem } from '@/types/database'

export default function SubsystemsPageClient({ subsystems, canCreate }: { subsystems: Subsystem[]; canCreate: boolean }) {
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-text-primary">Subsystems</h1>
          <p className="mt-0.5 text-xs font-mono text-text-muted">The engineering groups that make up the car.</p>
        </div>
        {canCreate && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={13} /> New Subsystem
          </Button>
        )}
      </div>

      {subsystems.length === 0 ? (
        <EmptyState icon={Boxes} title="No active subsystems" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {subsystems.map((s) => (
            <Link key={s.id} href={`/subsystems/${s.id}`}>
              <Panel className={`flex items-center justify-between p-4 transition-colors hover:border-accent-blue/40 ${!s.active ? 'opacity-60' : ''}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-sm font-bold text-text-primary">{s.name}</h2>
                    {!s.active && <Badge tone="rose">Archived</Badge>}
                  </div>
                  {s.description && <p className="mt-1 line-clamp-2 text-[11px] text-text-secondary">{s.description}</p>}
                </div>
                <ChevronRight size={16} className="flex-shrink-0 text-text-muted" />
              </Panel>
            </Link>
          ))}
        </div>
      )}

      <CreateSubsystemModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}

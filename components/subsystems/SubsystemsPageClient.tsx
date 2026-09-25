'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Boxes, ChevronRight, Plus } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import PageHeader from '@/components/ui/PageHeader'
import DataTable, { type Column } from '@/components/ui/DataTable'
import CreateSubsystemModal from './CreateSubsystemModal'
import type { Subsystem } from '@/types/database'

export default function SubsystemsPageClient({ subsystems, canCreate }: { subsystems: Subsystem[]; canCreate: boolean }) {
  const [createOpen, setCreateOpen] = useState(false)

  const columns: Column<Subsystem>[] = [
    {
      key: 'name',
      header: 'Subsystem',
      cell: (s) => (
        <Link href={`/subsystems/${s.id}`} className="group block">
          <span className="font-medium text-text-primary group-hover:text-accent-blue">{s.name}</span>
          {!s.active && (
            <span className="ml-2">
              <Badge tone="danger">Archived</Badge>
            </span>
          )}
          {s.description && <span className="mt-0.5 block max-w-2xl truncate text-xs text-text-muted">{s.description}</span>}
        </Link>
      ),
    },
    {
      key: 'open',
      header: '',
      align: 'right',
      cell: (s) => (
        <Link href={`/subsystems/${s.id}`} aria-label={`Open ${s.name}`} className="inline-flex text-text-muted hover:text-text-primary">
          <ChevronRight size={16} />
        </Link>
      ),
    },
  ]

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Subsystems"
        description="The engineering groups that make up the car. Open one for its members, categories and tasks."
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus size={13} /> New subsystem
            </Button>
          ) : undefined
        }
      />
      <DataTable caption="Subsystems" columns={columns} rows={subsystems} rowKey={(s) => s.id} emptyState={<EmptyState icon={Boxes} title="No active subsystems" />} />
      <CreateSubsystemModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}

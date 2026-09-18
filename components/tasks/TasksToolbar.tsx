'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Send } from 'lucide-react'
import Button from '@/components/ui/Button'
import CreateTaskModal from './CreateTaskModal'
import RequestTaskModal from './RequestTaskModal'
import type { Subsystem, SubsystemCategory } from '@/types/database'

interface TasksToolbarProps {
  canCreate: boolean
  subsystems: Subsystem[]
  createSubsystems: Subsystem[]
  categories: SubsystemCategory[]
  activeTab: 'board' | 'requests'
  pendingRequestCount: number
}

export default function TasksToolbar({ canCreate, subsystems, createSubsystems, categories, activeTab, pendingRequestCount }: TasksToolbarProps) {
  const [createOpen, setCreateOpen] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
        <Link
          href="/tasks"
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${activeTab === 'board' ? 'bg-accent-blue/15 text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
        >
          Board
        </Link>
        <Link
          href="/tasks?tab=requests"
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${activeTab === 'requests' ? 'bg-accent-blue/15 text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
        >
          Requests{pendingRequestCount > 0 ? ` (${pendingRequestCount})` : ''}
        </Link>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => setRequestOpen(true)}>
          <Send size={13} /> Request a Task
        </Button>
        {canCreate && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={13} /> New Task
          </Button>
        )}
      </div>

      <CreateTaskModal open={createOpen} onClose={() => setCreateOpen(false)} subsystems={createSubsystems} categories={categories} />
      <RequestTaskModal open={requestOpen} onClose={() => setRequestOpen(false)} subsystems={subsystems} />
    </div>
  )
}

'use client'

import { useState } from 'react'
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
}

// The page's actions (they sit in the page header); the Board / Requests switch is a <Tabs/> on the page itself.
export default function TasksToolbar({ canCreate, subsystems, createSubsystems, categories }: TasksToolbarProps) {
  const [createOpen, setCreateOpen] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setRequestOpen(true)}>
        <Send size={13} /> Request a task
      </Button>
      {canCreate && (
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={13} /> New task
        </Button>
      )}
      <CreateTaskModal open={createOpen} onClose={() => setCreateOpen(false)} subsystems={createSubsystems} categories={categories} />
      <RequestTaskModal open={requestOpen} onClose={() => setRequestOpen(false)} subsystems={subsystems} />
    </>
  )
}
'use client'

import { useState } from 'react'
import { Plus, Flag } from 'lucide-react'
import Button from '@/components/ui/Button'
import CreateCalendarEventModal from './CreateCalendarEventModal'
import CreateMilestoneModal from './CreateMilestoneModal'
import type { Subsystem } from '@/types/database'

interface CalendarToolbarProps {
  canManage: boolean
  subsystemOptions: Subsystem[]
  isCtoOrAdmin: boolean
}

export default function CalendarToolbar({ canManage, subsystemOptions, isCtoOrAdmin }: CalendarToolbarProps) {
  const [eventOpen, setEventOpen] = useState(false)
  const [milestoneOpen, setMilestoneOpen] = useState(false)

  if (!canManage) return null

  return (
    <div className="flex justify-end gap-2">
      <Button size="sm" variant="secondary" onClick={() => setMilestoneOpen(true)}>
        <Flag size={13} /> New Milestone
      </Button>
      <Button size="sm" onClick={() => setEventOpen(true)}>
        <Plus size={13} /> New Event
      </Button>
      <CreateCalendarEventModal open={eventOpen} onClose={() => setEventOpen(false)} subsystemOptions={subsystemOptions} isCtoOrAdmin={isCtoOrAdmin} />
      <CreateMilestoneModal open={milestoneOpen} onClose={() => setMilestoneOpen(false)} subsystemOptions={subsystemOptions} isCtoOrAdmin={isCtoOrAdmin} />
    </div>
  )
}

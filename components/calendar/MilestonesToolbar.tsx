'use client'

import { useState } from 'react'
import { Flag } from 'lucide-react'
import Button from '@/components/ui/Button'
import CreateMilestoneModal from './CreateMilestoneModal'
import type { Subsystem } from '@/types/database'

// Same permission as adding a milestone from the calendar (the database re-checks it): the whole-team schedule
// managers, or a lead for their own subsystem.
export default function MilestonesToolbar({ canManage, subsystemOptions, isCtoOrAdmin }: { canManage: boolean; subsystemOptions: Subsystem[]; isCtoOrAdmin: boolean }) {
  const [open, setOpen] = useState(false)
  if (!canManage) return null
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Flag size={13} /> New milestone
      </Button>
      <CreateMilestoneModal open={open} onClose={() => setOpen(false)} subsystemOptions={subsystemOptions} isCtoOrAdmin={isCtoOrAdmin} />
    </>
  )
}

'use client'

import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import Button from '@/components/ui/Button'
import PartFormModal from './PartFormModal'
import type { PartCatalogRow } from '@/types/database'

interface CommonProps {
  subsystemOptions: { id: string; name: string }[]
  canMoveSubsystem: boolean
}

// "Add part" (list page) and "Edit part" (detail page). Only rendered for people who can manage parts; the form
// fields are re-checked by the database either way.
export function AddPartButton({ subsystemOptions, canMoveSubsystem }: CommonProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={13} /> Add part
      </Button>
      {open && <PartFormModal open onClose={() => setOpen(false)} part={null} subsystemOptions={subsystemOptions} canMoveSubsystem={canMoveSubsystem} />}
    </>
  )
}

export function EditPartButton({ part, subsystemOptions, canMoveSubsystem }: CommonProps & { part: PartCatalogRow }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Pencil size={13} /> Edit
      </Button>
      {open && <PartFormModal key={part.updated_at} open onClose={() => setOpen(false)} part={part} subsystemOptions={subsystemOptions} canMoveSubsystem={canMoveSubsystem} />}
    </>
  )
}

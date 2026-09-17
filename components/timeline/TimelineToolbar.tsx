'use client'

import { useState } from 'react'
import { Settings } from 'lucide-react'
import Button from '@/components/ui/Button'
import ManageColumnsModal from './ManageColumnsModal'
import type { TimelineColumn } from '@/types/database'

export default function TimelineToolbar({ isCtoOrAdmin, allColumns }: { isCtoOrAdmin: boolean; allColumns: TimelineColumn[] }) {
  const [open, setOpen] = useState(false)

  if (!isCtoOrAdmin) return null

  return (
    <div className="flex justify-end">
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Settings size={13} /> Manage Columns
      </Button>
      <ManageColumnsModal open={open} onClose={() => setOpen(false)} columns={allColumns} />
    </div>
  )
}

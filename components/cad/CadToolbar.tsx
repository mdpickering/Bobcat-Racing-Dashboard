'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import Button from '@/components/ui/Button'
import CreateCadReviewModal from './CreateCadReviewModal'
import type { Subsystem } from '@/types/database'

export default function CadToolbar({ subsystems }: { subsystems: Subsystem[] }) {
  const [createOpen, setCreateOpen] = useState(false)

  if (subsystems.length === 0) return null

  return (
    <div className="flex justify-end">
      <Button size="sm" onClick={() => setCreateOpen(true)}>
        <Plus size={13} /> Submit CAD Review
      </Button>
      <CreateCadReviewModal open={createOpen} onClose={() => setCreateOpen(false)} subsystems={subsystems} />
    </div>
  )
}

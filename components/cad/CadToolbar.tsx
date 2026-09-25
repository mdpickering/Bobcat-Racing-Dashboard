'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import Button from '@/components/ui/Button'
import CreateCadReviewModal from './CreateCadReviewModal'
import type { Subsystem } from '@/types/database'

// The page's primary action (rendered in the page header).
export default function CadToolbar({ subsystems }: { subsystems: Subsystem[] }) {
  const [createOpen, setCreateOpen] = useState(false)

  if (subsystems.length === 0) return null

  return (
    <>
      <Button size="sm" onClick={() => setCreateOpen(true)}>
        <Plus size={13} /> Submit CAD review
      </Button>
      <CreateCadReviewModal open={createOpen} onClose={() => setCreateOpen(false)} subsystems={subsystems} />
    </>
  )
}

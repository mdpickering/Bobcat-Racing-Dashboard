'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import Button from '@/components/ui/Button'
import CreatePurchaseRequestModal from './CreatePurchaseRequestModal'
import type { Subsystem } from '@/types/database'

// The page's primary action (rendered in the page header).
export default function PurchasingToolbar({ canCreate, subsystems }: { canCreate: boolean; subsystems: Subsystem[] }) {
  const [createOpen, setCreateOpen] = useState(false)

  if (!canCreate) return null

  return (
    <>
      <Button size="sm" onClick={() => setCreateOpen(true)}>
        <Plus size={13} /> New purchase request
      </Button>
      <CreatePurchaseRequestModal open={createOpen} onClose={() => setCreateOpen(false)} subsystems={subsystems} />
    </>
  )
}

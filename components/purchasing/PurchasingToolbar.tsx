'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import Button from '@/components/ui/Button'
import CreatePurchaseRequestModal from './CreatePurchaseRequestModal'
import type { Subsystem } from '@/types/database'

export default function PurchasingToolbar({ canCreate, subsystems }: { canCreate: boolean; subsystems: Subsystem[] }) {
  const [createOpen, setCreateOpen] = useState(false)

  if (!canCreate) return null

  return (
    <div className="flex justify-end">
      <Button size="sm" onClick={() => setCreateOpen(true)}>
        <Plus size={13} /> New Purchase Request
      </Button>
      <CreatePurchaseRequestModal open={createOpen} onClose={() => setCreateOpen(false)} subsystems={subsystems} />
    </div>
  )
}

'use client'

import { useState } from 'react'
import { PackageCheck } from 'lucide-react'
import Button from '@/components/ui/Button'
import ReceivingFormModal from './ReceivingFormModal'

interface ReceiveButtonProps {
  purchaseRequestId: string
  requestTitle: string
  size?: 'sm' | 'md'
  label?: string
}

export default function ReceiveButton({ purchaseRequestId, requestTitle, size = 'sm', label = 'Receive' }: ReceiveButtonProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size={size} variant="secondary" onClick={() => setOpen(true)}>
        <PackageCheck size={size === 'sm' ? 12 : 13} /> {label}
      </Button>
      {open && <ReceivingFormModal open onClose={() => setOpen(false)} purchaseRequestId={purchaseRequestId} requestTitle={requestTitle} />}
    </>
  )
}

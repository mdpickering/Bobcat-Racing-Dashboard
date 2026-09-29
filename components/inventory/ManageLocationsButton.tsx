'use client'

import { useState } from 'react'
import { MapPin } from 'lucide-react'
import Button from '@/components/ui/Button'
import LocationManagerModal from './LocationManagerModal'
import type { InventoryLocation } from '@/types/database'

export default function ManageLocationsButton({ locations }: { locations: InventoryLocation[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <MapPin size={13} /> Manage locations
      </Button>
      <LocationManagerModal open={open} onClose={() => setOpen(false)} locations={locations} />
    </>
  )
}

'use client'

import FilterBar from '@/components/ui/FilterBar'
import { ALL_CAD_STATUSES } from './CadStatusBadge'
import type { Subsystem } from '@/types/database'

export default function CadFilters({ subsystems }: { subsystems: Subsystem[] }) {
  return (
    <FilterBar
      fields={[
        { key: 'subsystem', allLabel: 'All subsystems', className: 'sm:w-48', options: subsystems.map((s) => ({ value: s.id, label: s.name })) },
        { key: 'status', allLabel: 'All statuses', className: 'sm:w-52', options: ALL_CAD_STATUSES.map((s) => ({ value: s, label: s })) },
      ]}
    />
  )
}

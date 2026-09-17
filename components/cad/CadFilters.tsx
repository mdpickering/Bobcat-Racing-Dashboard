'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition } from 'react'
import Select from '@/components/ui/Select'
import { ALL_CAD_STATUSES } from './CadStatusBadge'
import type { Subsystem } from '@/types/database'

export default function CadFilters({ subsystems }: { subsystems: Subsystem[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <Select className="sm:w-44" value={searchParams.get('subsystem') ?? ''} onChange={(e) => updateParam('subsystem', e.target.value)}>
        <option value="">All subsystems</option>
        {subsystems.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>

      <Select className="sm:w-48" value={searchParams.get('status') ?? ''} onChange={(e) => updateParam('status', e.target.value)}>
        <option value="">All statuses</option>
        {ALL_CAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
    </div>
  )
}

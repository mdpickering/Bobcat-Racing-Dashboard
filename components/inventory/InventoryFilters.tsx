'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'

interface InventoryFiltersProps {
  subsystems: { id: string; name: string }[]
  locations: { id: string; name: string }[]
}

// Search, subsystem, location and status all live in the URL, exactly like the Parts filters. Default status is
// Active; "All" includes deactivated parts.
export default function InventoryFilters({ subsystems, locations }: InventoryFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [search, setSearch] = useState(searchParams.get('q') ?? '')

  useEffect(() => {
    setSearch(searchParams.get('q') ?? '')
  }, [searchParams])

  function update(changes: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <form
        className="sm:w-64"
        onSubmit={(e) => {
          e.preventDefault()
          update({ q: search.trim() })
        }}
      >
        <Input
          aria-label="Search inventory"
          placeholder="Search part #, name, subsystem, location…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onBlur={() => search.trim() !== (searchParams.get('q') ?? '') && update({ q: search.trim() })}
        />
      </form>
      <Select className="sm:w-52" aria-label="Subsystem" value={searchParams.get('subsystem') ?? ''} onChange={(e) => update({ subsystem: e.target.value })}>
        <option value="">All subsystems</option>
        {subsystems.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      {locations.length > 0 && (
        <Select className="sm:w-44" aria-label="Location" value={searchParams.get('location') ?? ''} onChange={(e) => update({ location: e.target.value })}>
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      )}
      <Select className="sm:w-32" aria-label="Status" value={searchParams.get('status') ?? 'active'} onChange={(e) => update({ status: e.target.value === 'active' ? '' : e.target.value })}>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="all">All</option>
      </Select>
    </div>
  )
}

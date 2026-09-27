'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'

interface PartsFiltersProps {
  subsystems: { id: string; name: string }[]
  vendors: { id: string; name: string }[]
}

// Search, subsystem, vendor and status all live in the URL, so a filtered list can be bookmarked or shared. The default
// status is Active; "All" includes deactivated parts.
export default function PartsFilters({ subsystems, vendors }: PartsFiltersProps) {
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
          aria-label="Search parts"
          placeholder="Search part #, name, manufacturer, vendor…"
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
      <Select className="sm:w-44" aria-label="Vendor" value={searchParams.get('vendor') ?? ''} onChange={(e) => update({ vendor: e.target.value })}>
        <option value="">All vendors</option>
        {vendors.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </Select>
      <Select className="sm:w-32" aria-label="Status" value={searchParams.get('status') ?? 'active'} onChange={(e) => update({ status: e.target.value === 'active' ? '' : e.target.value })}>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="all">All</option>
      </Select>
    </div>
  )
}

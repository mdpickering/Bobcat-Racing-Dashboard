'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'

// Search (name, contact name, email) and status, both in the URL. The default status is Active.
export default function VendorFilters() {
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
        className="sm:w-72"
        onSubmit={(e) => {
          e.preventDefault()
          update({ q: search.trim() })
        }}
      >
        <Input
          aria-label="Search vendors"
          placeholder="Search vendor, contact name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onBlur={() => search.trim() !== (searchParams.get('q') ?? '') && update({ q: search.trim() })}
        />
      </form>
      <Select className="sm:w-32" aria-label="Status" value={searchParams.get('status') ?? 'active'} onChange={(e) => update({ status: e.target.value === 'active' ? '' : e.target.value })}>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="all">All</option>
      </Select>
    </div>
  )
}

'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, useEffect, useTransition } from 'react'
import { Search } from 'lucide-react'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'

export default function UserFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [search, setSearch] = useState(searchParams.get('search') ?? '')

  useEffect(() => {
    setSearch(searchParams.get('search') ?? '')
  }, [searchParams])

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    updateParam('search', search)
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <form onSubmit={handleSearchSubmit} className="flex min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
        <Search size={14} className="text-text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email…"
          className="w-full bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
        />
      </form>

      <Select className="sm:w-36" value={searchParams.get('role') ?? ''} onChange={(e) => updateParam('role', e.target.value)}>
        <option value="">All roles</option>
        <option value="member">Member</option>
        <option value="team_lead">Team Lead</option>
        <option value="coo">COO</option>
        <option value="cto">CTO</option>
        <option value="admin">Admin</option>
      </Select>

      <Select className="sm:w-40" value={searchParams.get('approved') ?? ''} onChange={(e) => updateParam('approved', e.target.value)}>
        <option value="">Approved &amp; pending</option>
        <option value="true">Approved only</option>
        <option value="false">Pending only</option>
      </Select>

      <Select className="sm:w-40" value={searchParams.get('active') ?? ''} onChange={(e) => updateParam('active', e.target.value)}>
        <option value="">Active &amp; inactive</option>
        <option value="true">Active only</option>
        <option value="false">Inactive only</option>
      </Select>
    </div>
  )
}

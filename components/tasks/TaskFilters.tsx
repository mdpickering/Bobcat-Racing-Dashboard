'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, useEffect, useTransition } from 'react'
import { Search } from 'lucide-react'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import type { Subsystem, SubsystemCategory } from '@/types/database'

const STATUSES = ['To Do', 'In Progress', 'Blocked', 'Review', 'Complete']
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']

export default function TaskFilters({ subsystems, categories }: { subsystems: Subsystem[]; categories: SubsystemCategory[] }) {
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

  const subsystemId = searchParams.get('subsystem') ?? ''
  const filteredCategories = subsystemId ? categories.filter((c) => c.subsystem_id === subsystemId) : categories

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <form onSubmit={handleSearchSubmit} className="flex min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
        <Search size={14} className="text-text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks…"
          className="w-full bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
        />
      </form>

      <Select className="sm:w-40" value={subsystemId} onChange={(e) => updateParam('subsystem', e.target.value)}>
        <option value="">All subsystems</option>
        {subsystems.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>

      <Select className="sm:w-40" value={searchParams.get('category') ?? ''} onChange={(e) => updateParam('category', e.target.value)}>
        <option value="">All categories</option>
        {filteredCategories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>

      <Select className="sm:w-36" value={searchParams.get('priority') ?? ''} onChange={(e) => updateParam('priority', e.target.value)}>
        <option value="">All priorities</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </Select>

      <Select className="sm:w-36" value={searchParams.get('status') ?? ''} onChange={(e) => updateParam('status', e.target.value)}>
        <option value="">All statuses</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
    </div>
  )
}

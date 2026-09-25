'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import Select from './Select'

// Filters live in the URL, so a filtered view can be bookmarked, shared and survives a refresh. This replaces the five
// hand-written copies of the same updateParam logic.
export function useUrlFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  function set(changes: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    const qs = params.toString()
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname))
  }

  return { get: (key: string) => searchParams.get(key) ?? '', set, searchParams, pathname }
}

export interface FilterField {
  key: string
  // the "no filter" option, e.g. "All statuses"
  allLabel: string
  options: { value: string; label: string }[]
  className?: string
}

interface FilterBarProps {
  search?: { key: string; placeholder: string }
  fields: FilterField[]
  // params that count as "filters" for the Clear button (defaults to every field + search)
  clearKeys?: string[]
}

export default function FilterBar({ search, fields, clearKeys }: FilterBarProps) {
  const filters = useUrlFilters()
  const [text, setText] = useState(search ? filters.get(search.key) : '')

  useEffect(() => {
    if (search) setText(filters.get(search.key))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.searchParams])

  const keys = clearKeys ?? [...fields.map((f) => f.key), ...(search ? [search.key] : [])]
  const active = keys.some((k) => filters.get(k) !== '')

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center" role="search">
      {search && (
        <form
          className="flex min-w-[10rem] flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 focus-within:border-accent-blue sm:max-w-xs"
          onSubmit={(e) => {
            e.preventDefault()
            filters.set({ [search.key]: text.trim() })
          }}
        >
          <Search size={14} className="flex-shrink-0 text-text-muted" aria-hidden="true" />
          <input
            aria-label={search.placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => text.trim() !== filters.get(search.key) && filters.set({ [search.key]: text.trim() })}
            placeholder={search.placeholder}
            className="w-full bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
          />
        </form>
      )}
      {fields.map((f) => (
        <Select key={f.key} aria-label={f.allLabel.replace(/^All /, '')} className={f.className ?? 'sm:w-40'} value={filters.get(f.key)} onChange={(e) => filters.set({ [f.key]: e.target.value })}>
          <option value="">{f.allLabel}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ))}
      {active && (
        <button
          type="button"
          onClick={() => filters.set(Object.fromEntries(keys.map((k) => [k, ''])))}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-text-secondary transition-colors hover:text-text-primary"
        >
          <X size={13} aria-hidden="true" /> Clear filters
        </button>
      )}
    </div>
  )
}

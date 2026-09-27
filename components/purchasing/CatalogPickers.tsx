'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import Input from '@/components/ui/Input'
import { createClient } from '@/lib/supabase/client'
import { formatUsd } from '@/lib/parts'
import type { PartCatalogRow } from '@/types/database'

// OPTIONAL pickers for purchasing (migration 0037). Choosing a catalog part or vendor fills the ordinary text fields
// (only the blank ones, see prefillFromPart) and remembers the link; nothing here is required and free-text entry
// works exactly as before. The lists are read with the caller's own access (any approved user can read the catalog)
// and only ACTIVE records are offered, matching the database rule that a new link must point at an active record.

export interface PickedPart {
  id: string
  part_number: string
  name: string
  subsystem_name: string
  manufacturer: string | null
  effective_unit_cost: number | null
  preferred_vendor_id: string | null
  preferred_vendor_name: string | null
  source_url: string | null
}

export interface PickedVendor {
  id: string
  name: string
  website: string | null
}

interface SearchSelectProps<T extends { id: string }> {
  label: string
  placeholder: string
  selected: T | null
  loader: () => Promise<T[]>
  match: (item: T, q: string) => boolean
  title: (item: T) => string
  detail: (item: T) => string
  onChange: (item: T | null) => void
  disabled?: boolean
}

function SearchSelect<T extends { id: string }>({ label, placeholder, selected, loader, match, title, detail, onChange, disabled }: SearchSelectProps<T>) {
  const [items, setItems] = useState<T[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  async function ensureLoaded() {
    if (items !== null) return
    try {
      setItems(await loader())
    } catch {
      setLoadError(true)
      setItems([])
    }
  }

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  if (selected) {
    return (
      <div>
        <div className="mb-1 block text-xs text-text-secondary">{label}</div>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-accent-blue/40 bg-accent-blue/5 px-3 py-1.5 text-xs">
          <span className="min-w-0 truncate text-text-primary">{title(selected)}</span>
          <button type="button" onClick={() => onChange(null)} disabled={disabled} className="flex-shrink-0 text-text-muted hover:text-text-primary" aria-label={`Clear ${label.toLowerCase()}`}>
            <X size={13} />
          </button>
        </div>
      </div>
    )
  }

  const results = (items ?? []).filter((i) => match(i, query)).slice(0, 8)

  return (
    <div ref={boxRef} className="relative">
      <label className="mb-1 block text-xs text-text-secondary">{label}</label>
      <div className="relative">
        <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <Input
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          className="pl-7"
          onFocus={() => {
            setOpen(true)
            ensureLoaded()
          }}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            ensureLoaded()
          }}
        />
      </div>
      {open && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-surface-raised text-xs shadow-panel" role="listbox">
          {items === null && <li className="px-3 py-2 text-text-muted">Loading…</li>}
          {items !== null && loadError && <li className="px-3 py-2 text-status-danger">Could not load the catalog. You can still type the details.</li>}
          {items !== null && !loadError && results.length === 0 && <li className="px-3 py-2 text-text-muted">{items.length === 0 ? 'Nothing in the catalog yet.' : 'No match. You can still type the details yourself.'}</li>}
          {results.map((i) => (
            <li key={i.id} role="option" aria-selected={false}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left hover:bg-border/40"
                onClick={() => {
                  onChange(i)
                  setQuery('')
                  setOpen(false)
                }}
              >
                <span className="block text-text-primary">{title(i)}</span>
                <span className="block text-[11px] text-text-muted">{detail(i)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function CatalogPartPicker({ selected, onChange, disabled }: { selected: PickedPart | null; onChange: (part: PickedPart | null) => void; disabled?: boolean }) {
  return (
    <SearchSelect<PickedPart>
      label="From the parts catalog (optional)"
      placeholder="Search part number, name or manufacturer…"
      selected={selected}
      disabled={disabled}
      loader={async () => {
        const { data, error } = await createClient()
          .from('parts_catalog')
          .select('id, part_number, name, subsystem_name, manufacturer, manufacturer_part_number, vendor_names, effective_unit_cost, preferred_vendor_id, preferred_vendor_name, source_url')
          .eq('active', true)
          .order('part_number', { ascending: true })
          .limit(2000)
        if (error) throw error
        return (data ?? []) as unknown as (PickedPart & { manufacturer_part_number: string | null; vendor_names: string })[]
      }}
      match={(p, q) => {
        const s = q.trim().toLowerCase()
        if (!s) return true
        const x = p as PickedPart & { manufacturer_part_number?: string | null; vendor_names?: string }
        return [x.part_number, x.name, x.manufacturer, x.manufacturer_part_number, x.vendor_names].some((f) => (f ?? '').toLowerCase().includes(s))
      }}
      title={(p) => `${p.part_number} · ${p.name}`}
      detail={(p) => [p.subsystem_name, p.manufacturer, p.preferred_vendor_name ? `Preferred: ${p.preferred_vendor_name}` : null, p.effective_unit_cost !== null ? formatUsd(Number(p.effective_unit_cost)) : null].filter(Boolean).join(' · ')}
      onChange={onChange}
    />
  )
}

export function CatalogVendorPicker({ selected, onChange, disabled }: { selected: PickedVendor | null; onChange: (vendor: PickedVendor | null) => void; disabled?: boolean }) {
  return (
    <SearchSelect<PickedVendor>
      label="From the vendor directory (optional)"
      placeholder="Search vendors…"
      selected={selected}
      disabled={disabled}
      loader={async () => {
        const { data, error } = await createClient().from('vendors').select('id, name, website').eq('active', true).order('name', { ascending: true }).limit(2000)
        if (error) throw error
        return (data ?? []) as PickedVendor[]
      }}
      match={(v, q) => !q.trim() || v.name.toLowerCase().includes(q.trim().toLowerCase())}
      title={(v) => v.name}
      detail={(v) => v.website?.replace(/^https?:\/\//, '') ?? 'No website'}
      onChange={onChange}
    />
  )
}

// Read the preferred vendor's own details for a chosen part (vendor part number, price, product link).
export async function fetchPreferredLink(partId: string): Promise<{ vendor_part_number: string | null; unit_cost: number | null; product_url: string | null } | null> {
  const { data } = await createClient().from('part_vendors').select('vendor_part_number, unit_cost, product_url').eq('part_id', partId).eq('is_preferred', true).maybeSingle()
  if (!data) return null
  const d = data as { vendor_part_number: string | null; unit_cost: number | string | null; product_url: string | null }
  return { vendor_part_number: d.vendor_part_number, unit_cost: d.unit_cost === null ? null : Number(d.unit_cost), product_url: d.product_url }
}

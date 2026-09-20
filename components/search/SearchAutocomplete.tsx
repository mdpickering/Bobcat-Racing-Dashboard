'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ListChecks, Boxes, User, ShoppingCart, Ruler, Search, Loader2, CornerDownLeft, type LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { globalSearch, type SearchResult, type SearchResultType } from '@/lib/supabase/queries/search'

const MIN_CHARS = 2
const DEBOUNCE_MS = 250
const FETCH_PER_TYPE = 4
const SHOW_PER_TYPE = 3
const MAX_SUGGESTIONS = 10

const CATEGORIES: { type: SearchResultType; label: string; icon: LucideIcon }[] = [
  { type: 'task', label: 'Tasks', icon: ListChecks },
  { type: 'subsystem', label: 'Subsystems', icon: Boxes },
  { type: 'person', label: 'People', icon: User },
  { type: 'purchase_request', label: 'Purchase Requests', icon: ShoppingCart },
  { type: 'cad_review', label: 'CAD Reviews', icon: Ruler },
]

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (!q) return <>{text}</>
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'ig'))
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="rounded-[3px] bg-qu-gold/25 px-px text-text-primary">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

interface SearchAutocompleteProps {
  className?: string
  autoFocus?: boolean
  // called after the user navigates away (a suggestion or the full search) — lets a wrapper close itself
  onDone?: () => void
  // called when Escape is pressed while the suggestion list is already closed
  onEscape?: () => void
}

// Header search with as-you-type suggestions. It reuses globalSearch (the same function behind the
// full results page), called with the signed-in user's own browser client, so every suggestion is
// filtered by the same row-level security as the results page — nothing extra is exposed.
export default function SearchAutocomplete({ className = '', autoFocus, onDone, onEscape }: SearchAutocompleteProps) {
  const router = useRouter()
  const uid = useId()
  const listboxId = `${uid}-listbox`
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const requestId = useRef(0)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  const trimmed = query.trim()
  const searchable = trimmed.length >= MIN_CHARS

  // Debounced fetch. requestId makes sure a slow, older response can never overwrite a newer one
  // (or repopulate the list after the text was cleared).
  useEffect(() => {
    const id = ++requestId.current
    if (!searchable) {
      setResults([])
      setStatus('idle')
      return
    }
    setStatus('loading')
    const timer = setTimeout(async () => {
      try {
        const data = await globalSearch(createClient(), trimmed, { perTypeLimit: FETCH_PER_TYPE })
        if (id !== requestId.current) return
        setResults(data)
        setStatus('done')
        setActive(-1)
      } catch {
        if (id !== requestId.current) return
        setResults([])
        setStatus('error')
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [trimmed, searchable])

  useEffect(() => {
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [])

  // At most SHOW_PER_TYPE per category and MAX_SUGGESTIONS overall, in category order.
  const groups = useMemo(() => {
    let remaining = MAX_SUGGESTIONS
    return CATEGORIES.map((c) => {
      const items = results.filter((r) => r.type === c.type).slice(0, Math.min(SHOW_PER_TYPE, remaining))
      remaining -= items.length
      return { ...c, items }
    }).filter((g) => g.items.length > 0)
  }, [results])
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])
  const footerIndex = flat.length // the "see all results" row is the last navigable row
  const rowCount = flat.length + 1

  function finish() {
    setOpen(false)
    inputRef.current?.blur()
    onDone?.()
  }

  function goToResult(result: SearchResult) {
    setQuery('')
    router.push(result.href)
    finish()
  }

  function goToFullSearch() {
    if (!trimmed) return
    router.push(`/search?q=${encodeURIComponent(trimmed)}`)
    finish()
  }

  // Enter on a highlighted suggestion opens it; otherwise it runs the normal full search.
  function submitCurrent() {
    if (open && active >= 0 && active < flat.length) goToResult(flat[active])
    else goToFullSearch()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    submitCurrent()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      if (e.nativeEvent.isComposing) return // Enter that just confirms an IME composition
      e.preventDefault()
      submitCurrent()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!searchable) return
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      const delta = e.key === 'ArrowDown' ? 1 : -1
      // from "nothing highlighted" Down goes to the first row and Up to the last; otherwise wrap around
      setActive((i) => (i < 0 ? (delta > 0 ? 0 : rowCount - 1) : (i + delta + rowCount) % rowCount))
    } else if (e.key === 'Escape') {
      // close the suggestion list if it is showing; otherwise let the wrapper (mobile overlay) close
      if (open && searchable) {
        e.preventDefault()
        setOpen(false)
        setActive(-1)
      } else {
        onEscape?.()
      }
    }
  }

  const showDropdown = open && searchable
  const activeId = active >= 0 ? `${uid}-opt-${active}` : undefined

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <form
        role="search"
        onSubmit={handleSubmit}
        className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs transition-colors focus-within:border-accent-blue"
      >
        <Search size={14} className="flex-shrink-0 text-text-muted" />
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          type="text"
          role="combobox"
          aria-label="Search"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search tasks, people, subsystems…"
          className="w-full min-w-0 bg-transparent text-text-primary outline-none placeholder:text-text-muted"
        />
        <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center" aria-hidden="true">
          {status === 'loading' && searchable && <Loader2 size={13} className="animate-spin text-text-muted" />}
        </span>
      </form>

      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Search suggestions"
          className="absolute inset-x-0 top-full z-40 mt-1.5 max-h-[min(26rem,70vh)] overflow-y-auto scrollbar-thin rounded-xl border border-border bg-surface-raised p-1.5 shadow-panel"
        >
          {status === 'loading' && flat.length === 0 && <div className="px-3 py-2.5 text-[11px] text-text-muted">Searching…</div>}
          {status === 'error' && <div className="px-3 py-2.5 text-[11px] text-rose-400">Couldn&apos;t load suggestions. Press Enter to search.</div>}
          {status === 'done' && flat.length === 0 && (
            <div className="px-3 py-2.5 text-[11px] text-text-muted">
              No matches for &ldquo;{trimmed}&rdquo;
            </div>
          )}

          {groups.map((group) => {
            const Icon = group.icon
            return (
              <div key={group.type} role="presentation">
                <div role="presentation" className="px-2.5 pb-1 pt-2 text-[10px] font-mono uppercase tracking-wide text-text-muted">
                  {group.label}
                </div>
                {group.items.map((r) => {
                  const index = flat.indexOf(r)
                  const isActive = index === active
                  return (
                    <div
                      key={`${r.type}-${r.id}`}
                      id={`${uid}-opt-${index}`}
                      role="option"
                      aria-selected={isActive}
                      onMouseDown={(e) => e.preventDefault()} // keep focus in the input so the click isn't lost to a blur
                      onMouseEnter={() => setActive(index)}
                      onClick={() => goToResult(r)}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs ${isActive ? 'bg-accent-blue/15' : ''}`}
                    >
                      <Icon size={14} className="flex-shrink-0 text-text-muted" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-text-primary">
                          <Highlight text={r.title} query={trimmed} />
                        </div>
                        {r.subtitle && <div className="truncate text-[10px] text-text-muted">{r.subtitle}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}

          <div
            id={`${uid}-opt-${footerIndex}`}
            role="option"
            aria-selected={active === footerIndex}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(footerIndex)}
            onClick={goToFullSearch}
            className={`mt-1 flex cursor-pointer items-center gap-2 rounded-lg border-t border-border px-2.5 py-2 text-[11px] text-text-secondary ${
              active === footerIndex ? 'bg-accent-blue/15 text-text-primary' : ''
            }`}
          >
            <CornerDownLeft size={13} className="flex-shrink-0 text-text-muted" />
            <span className="truncate">
              See all results for &ldquo;{trimmed}&rdquo;
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

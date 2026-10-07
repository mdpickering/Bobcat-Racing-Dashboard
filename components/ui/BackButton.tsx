'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

interface BackButtonProps {
  // Where to go if there's no real in-app history to return to (the page was opened directly, from
  // a bookmark, or a notification link in a fresh tab).
  fallbackHref: string
  label?: string
  className?: string
}

// Prefers real browser back navigation over a fixed destination: returning from a task (or any
// other detail page) should land wherever the user actually came from — Operations with its filters
// and scroll position intact, Business, a search result — rather than always resetting to one
// hardcoded list. This is the one shared way detail pages avoid destroying the user's context; falls
// back to a fixed link only when there's no in-app history to go back to.
export default function BackButton({ fallbackHref, label = 'Back', className = '' }: BackButtonProps) {
  const router = useRouter()

  function handleClick() {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push(fallbackHref)
  }

  return (
    <button type="button" onClick={handleClick} className={`mb-3 flex min-h-[44px] items-center md:min-h-[40px] gap-1 text-[12px] text-text-muted hover:text-accent-blue ${className}`}>
      <ChevronLeft size={13} /> {label}
    </button>
  )
}

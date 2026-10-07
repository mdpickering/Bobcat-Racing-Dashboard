'use client'

import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  // e.g. an "Open full page" link, rendered next to the close button
  headerActions?: React.ReactNode
  maxWidthClassName?: string
}

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// A slide-in side panel for quick inspection/edit without leaving the current page -- same
// accessibility contract as Modal (dialog role, focus trap, Escape, body scroll lock, return focus
// on close), just a different shape: fixed to the right edge, full height, for content that's more
// naturally a "panel" than a centered dialog (e.g. TaskPreviewDrawer). Closing it never navigates
// anywhere, so whatever list opened it is exactly as the user left it.
export default function Drawer({ open, onClose, title, children, headerActions, maxWidthClassName = 'max-w-md' }: DrawerProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return
    triggerRef.current = document.activeElement

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const frame = requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      ;(first ?? panelRef.current)?.focus()
    })

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => el.offsetParent !== null)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex h-full w-full ${maxWidthClassName} flex-col overflow-y-auto scrollbar-thin border-l border-border bg-surface-raised shadow-panel outline-none`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-surface-raised px-5 py-3">
          <h2 id={titleId} className="min-w-0 truncate text-sm font-bold text-text-primary">
            {title}
          </h2>
          <div className="flex flex-shrink-0 items-center gap-1">
            {headerActions}
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-lg text-text-secondary hover:bg-surface hover:text-text-primary">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 p-5">{children}</div>
      </div>
    </div>
  )
}

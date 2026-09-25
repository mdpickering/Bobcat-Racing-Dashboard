'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'

export interface MenuRenderProps {
  open: boolean
  triggerProps: {
    ref: React.RefObject<HTMLButtonElement>
    onClick: () => void
    onKeyDown: (e: React.KeyboardEvent) => void
    'aria-haspopup': 'menu'
    'aria-expanded': boolean
    'aria-controls': string
  }
}

interface MenuProps {
  trigger: (props: MenuRenderProps) => React.ReactNode
  children: (helpers: { close: () => void }) => React.ReactNode
  // where the panel opens relative to the trigger
  placement?: 'bottom-start' | 'bottom-end' | 'right-start'
  panelClassName?: string
  label: string
}

// Accessible dropdown: Enter/Space/ArrowDown opens it, arrows move between items, Home/End jump, Escape closes and
// returns focus to the trigger, and clicking outside closes it. The panel is position:fixed so it is never clipped by
// a scrolling or overflow-hidden ancestor (the sidebar is both). Items are any element with role="menuitem".
export default function Menu({ trigger, children, placement = 'bottom-start', panelClassName = '', label }: MenuProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const id = useId()

  const close = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])

  const openMenu = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    if (placement === 'right-start') setPos({ top: r.top, left: r.right + 8 })
    else if (placement === 'bottom-end') setPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
    else setPos({ top: r.bottom + 6, left: r.left })
    setOpen(true)
  }, [placement])

  useEffect(() => {
    if (!open) return
    // focus the first item (or the current one) once the panel exists
    const items = panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')
    const current = panelRef.current?.querySelector<HTMLElement>('[role="menuitem"][aria-current="true"]')
    ;(current ?? items?.[0])?.focus()

    function onPointerDown(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onResize() {
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  function onPanelKeyDown(e: React.KeyboardEvent) {
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const index = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      items[(index + 1) % items.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      items[(index - 1 + items.length) % items.length]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      items[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      items[items.length - 1]?.focus()
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  const triggerProps: MenuRenderProps['triggerProps'] = {
    ref: triggerRef,
    onClick: () => (open ? setOpen(false) : openMenu()),
    onKeyDown: (e) => {
      if (e.key === 'ArrowDown' && !open) {
        e.preventDefault()
        openMenu()
      }
    },
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': id,
  }

  return (
    <>
      {trigger({ open, triggerProps })}
      {open && pos && (
        <div
          id={id}
          ref={panelRef}
          role="menu"
          aria-label={label}
          onKeyDown={onPanelKeyDown}
          style={{ position: 'fixed', top: pos.top, left: pos.left, right: pos.right }}
          className={`menu-panel z-[60] min-w-[14rem] rounded-xl border border-border bg-surface-raised p-1.5 shadow-panel ${panelClassName}`}
        >
          {children({ close: () => setOpen(false) })}
        </div>
      )}
    </>
  )
}

'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { STATUS_TONE_CLASSES, type StatusTone } from '@/lib/status'

interface ToastItem {
  id: number
  tone: StatusTone
  message: string
}

interface ToastContextValue {
  push: (message: string, tone?: StatusTone) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const DURATION_MS = 5000

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback(
    (message: string, tone: StatusTone = 'info') => {
      const id = nextId.current++
      setToasts((t) => [...t.slice(-3), { id, tone, message }])
      window.setTimeout(() => dismiss(id), DURATION_MS)
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`pointer-events-auto flex items-start gap-2 rounded-lg border bg-surface-raised px-3 py-2 text-xs shadow-panel ${STATUS_TONE_CLASSES[t.tone].split(' ').filter((c) => c.startsWith('border-')).join(' ')}`}>
            <span className="flex-1 text-text-primary">{t.message}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-text-muted hover:text-text-primary">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  // outside a provider (e.g. an isolated preview) fail quietly instead of crashing the page
  return ctx ?? { push: () => {} }
}

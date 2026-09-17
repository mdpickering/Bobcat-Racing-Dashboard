'use client'

import { AlertTriangle } from 'lucide-react'
import Button from '@/components/ui/Button'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 px-6 py-16 text-center">
      <AlertTriangle size={24} className="text-rose-400" />
      <p className="text-sm font-semibold text-rose-300">Something went wrong loading this page.</p>
      <p className="max-w-sm text-xs text-text-muted">
        {error.message || 'An unexpected error occurred.'}
      </p>
      <Button size="sm" variant="secondary" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}

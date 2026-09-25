'use client'

import { AlertTriangle } from 'lucide-react'
import Button from '@/components/ui/Button'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-status-danger/30 bg-status-danger/5 px-6 py-16 text-center">
      <AlertTriangle size={24} className="text-status-danger" />
      <p className="text-sm font-semibold text-status-danger">Something went wrong loading this page.</p>
      <p className="max-w-sm text-xs text-text-muted">
        {error.message || 'An unexpected error occurred.'}
      </p>
      <Button size="sm" variant="secondary" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}

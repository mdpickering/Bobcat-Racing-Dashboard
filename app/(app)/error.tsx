'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import Button from '@/components/ui/Button'
import { isChunkLoadError, reloadForNewDeploy } from '@/lib/chunkError'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // A tab opened before a deploy asks for script files that were replaced. That is not a real failure: reload once to get
  // the new version (lib/chunkError.ts refuses a second automatic reload within 30 seconds, so it can never loop).
  const stale = isChunkLoadError(error)
  useEffect(() => {
    if (stale) reloadForNewDeploy()
    else console.error(error)
  }, [error, stale])

  if (stale) {
    return (
      <div role="status" className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface px-6 py-16 text-center">
        <RefreshCw size={22} className="text-accent-blue" aria-hidden="true" />
        <p className="text-sm font-semibold text-text-primary">A new version of the app is available.</p>
        <p className="max-w-sm text-xs text-text-muted">This page was opened before the latest update. Reloading brings it up to date.</p>
        <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
          Reload now
        </Button>
      </div>
    )
  }

  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-status-danger/30 bg-status-danger/5 px-6 py-16 text-center">
      <AlertTriangle size={24} className="text-status-danger" aria-hidden="true" />
      <p className="text-sm font-semibold text-status-danger">Something went wrong loading this page.</p>
      <p className="max-w-sm text-xs text-text-muted">{error.message || 'An unexpected error occurred.'}</p>
      {error.digest && <p className="font-mono text-2xs text-text-muted">Reference {error.digest}</p>}
      <Button size="sm" variant="secondary" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'

// Reflects the browser's real network state (online/offline events) -- not a claim about the database or any live
// sync, which this app does not have. When the device is offline, saves will fail, so say so plainly.
export default function ConnectionStatus() {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    setOnline(navigator.onLine)
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return (
    <div role="status" className="flex items-center gap-2 px-1 text-2xs text-text-secondary">
      <span className="relative flex h-2 w-2 flex-shrink-0" aria-hidden="true">
        {online && <span className="absolute inline-flex h-full w-full rounded-full bg-status-success opacity-60 motion-safe:animate-ping" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${online ? 'bg-status-success' : 'bg-status-warning'}`} />
      </span>
      {online ? 'Connected' : 'Offline: changes may not save'}
    </div>
  )
}

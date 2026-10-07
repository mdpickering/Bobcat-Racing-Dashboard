'use client'

import { useEffect } from 'react'

// The last line of defence: renders only when something fails so early that not even the root layout could draw (so
// the app's stylesheet and theme are not available -- everything here is inline on purpose).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#070d17', color: '#f1f5f9', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ maxWidth: 420, width: '100%', background: '#0b1b2f', border: '1px solid #213754', borderRadius: 24, padding: 32 }}>
            <h1 style={{ margin: '0 0 8px', fontSize: 20 }}>Something went wrong</h1>
            <p style={{ margin: '0 0 20px', fontSize: 13, lineHeight: 1.6, color: '#94a3b8' }}>
              The app hit an unexpected error. Try again, and if it keeps happening tell a team admin{error.digest ? ` (reference ${error.digest})` : ''}.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{ background: '#ffc72c', color: '#0c2340', border: 0, borderRadius: 12, padding: '10px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}

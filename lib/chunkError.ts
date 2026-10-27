// After every deploy the script files get new names. A tab that was opened before the deploy still asks for the old ones, which
// no longer exist, and the browser reports "Loading chunk 1234 failed" (or "ChunkLoadError", or "Failed to fetch dynamically
// imported module"). The page itself is fine: a reload fetches the new version. These helpers let the error screens do that
// reload for the person instead of showing them a failure.

const PATTERN = /ChunkLoadError|Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false
  const name = typeof error === 'object' && 'name' in error ? String((error as { name?: unknown }).name ?? '') : ''
  const message = typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message ?? '') : String(error)
  return name === 'ChunkLoadError' || PATTERN.test(message)
}

const KEY = 'chunk-reload-at'
// A reload that does not cure it (the file really is missing) must not loop forever: allow one automatic reload per window.
export const RELOAD_WINDOW_MS = 30_000

interface Store {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** True when an automatic reload is allowed now (and records it); false if one already happened in the last 30 seconds. */
export function shouldAutoReload(now: number, store: Store | null): boolean {
  if (!store) return false
  try {
    const last = Number(store.getItem(KEY))
    if (Number.isFinite(last) && last > 0 && now - last < RELOAD_WINDOW_MS) return false
    store.setItem(KEY, String(now))
    return true
  } catch {
    // storage blocked (private window...): never risk a reload loop
    return false
  }
}

/** Reload the page once for a stale-deploy chunk error. Returns whether it reloaded. */
export function reloadForNewDeploy(): boolean {
  if (typeof window === 'undefined') return false
  let store: Store | null = null
  try {
    store = window.sessionStorage
  } catch {
    store = null
  }
  if (!shouldAutoReload(Date.now(), store)) return false
  window.location.reload()
  return true
}

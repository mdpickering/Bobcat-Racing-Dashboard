import { describe, expect, it } from 'vitest'
import { RELOAD_WINDOW_MS, isChunkLoadError, shouldAutoReload } from './chunkError'

describe('isChunkLoadError', () => {
  it('recognises the stale-deploy failures browsers report', () => {
    expect(isChunkLoadError(new Error('Loading chunk 1685 failed. (error: https://x.vercel.app/_next/static/chunks/1685-0b3b.js)'))).toBe(true)
    expect(isChunkLoadError(new Error('Loading CSS chunk 42 failed.'))).toBe(true)
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: https://x/app.js'))).toBe(true)
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true)
    const named = new Error('boom')
    named.name = 'ChunkLoadError'
    expect(isChunkLoadError(named)).toBe(true)
  })
  it('leaves ordinary errors alone', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(isChunkLoadError(new Error('column tasks.size does not exist'))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
  })
  it('accepts a plain string', () => {
    expect(isChunkLoadError('Loading chunk 7 failed.')).toBe(true)
  })
})

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), data }
}

describe('shouldAutoReload', () => {
  it('allows the first reload and records it', () => {
    const s = memory()
    expect(shouldAutoReload(1_000_000, s)).toBe(true)
    expect(s.data['chunk-reload-at']).toBe('1000000')
  })
  it('refuses a second reload inside the window, so a missing file cannot cause a loop', () => {
    const s = memory()
    shouldAutoReload(1_000_000, s)
    expect(shouldAutoReload(1_000_000 + RELOAD_WINDOW_MS - 1, s)).toBe(false)
  })
  it('allows another once the window has passed', () => {
    const s = memory()
    shouldAutoReload(1_000_000, s)
    expect(shouldAutoReload(1_000_000 + RELOAD_WINDOW_MS, s)).toBe(true)
  })
  it('never reloads without storage, or when storage throws', () => {
    expect(shouldAutoReload(1, null)).toBe(false)
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => {} }
    expect(shouldAutoReload(1, broken)).toBe(false)
  })
})

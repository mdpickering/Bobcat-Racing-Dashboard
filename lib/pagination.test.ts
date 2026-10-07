import { describe, expect, it } from 'vitest'
import { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, hitLimit, nextListLimit, parseListLimit } from './pagination'

describe('parseListLimit', () => {
  it('defaults when absent or invalid', () => {
    expect(parseListLimit(undefined)).toBe(DEFAULT_LIST_LIMIT)
    expect(parseListLimit('')).toBe(DEFAULT_LIST_LIMIT)
    expect(parseListLimit('abc')).toBe(DEFAULT_LIST_LIMIT)
    expect(parseListLimit('-5')).toBe(DEFAULT_LIST_LIMIT)
    expect(parseListLimit('0')).toBe(DEFAULT_LIST_LIMIT)
  })
  it('accepts a positive whole number and caps it', () => {
    expect(parseListLimit('400')).toBe(400)
    expect(parseListLimit('12.9')).toBe(12)
    expect(parseListLimit('999999')).toBe(MAX_LIST_LIMIT)
  })
})

describe('hitLimit and nextListLimit', () => {
  it('reports when a list may have more rows behind it', () => {
    expect(hitLimit(199, 200)).toBe(false)
    expect(hitLimit(200, 200)).toBe(true)
  })
  it('doubles the limit but never past the maximum', () => {
    expect(nextListLimit(200)).toBe(400)
    expect(nextListLimit(MAX_LIST_LIMIT)).toBe(MAX_LIST_LIMIT)
    expect(nextListLimit(1500)).toBe(MAX_LIST_LIMIT)
  })
})

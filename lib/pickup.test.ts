import { describe, expect, it } from 'vitest'
import { MAX_PICKUP_TASKS, canSetTaskSize, daysWaiting, isTaskSize, slotsLeft, sortPickupTasks, waitingLabel, type PickupTask } from './pickup'

const t = (over: Partial<PickupTask> & { id?: string } = {}): Pick<PickupTask, 'size' | 'priority' | 'created_at'> & { id: string } => ({
  id: over.id ?? 'x',
  size: over.size ?? 'short',
  priority: over.priority ?? 'Medium',
  created_at: over.created_at ?? '2026-10-01T00:00:00Z',
})

describe('sortPickupTasks', () => {
  it('puts the quickest first, then the more important, then the longest waiting', () => {
    const sorted = sortPickupTasks([
      t({ id: 'half', size: 'half_day', priority: 'Critical' }),
      t({ id: 'short-low', size: 'short', priority: 'Low' }),
      t({ id: 'quick-new', size: 'quick', priority: 'Medium', created_at: '2026-10-05T00:00:00Z' }),
      t({ id: 'quick-old', size: 'quick', priority: 'Medium', created_at: '2026-09-01T00:00:00Z' }),
      t({ id: 'quick-high', size: 'quick', priority: 'High', created_at: '2026-10-06T00:00:00Z' }),
      t({ id: 'short-high', size: 'short', priority: 'High' }),
    ]).map((x) => x.id)
    expect(sorted).toEqual(['quick-high', 'quick-old', 'quick-new', 'short-high', 'short-low', 'half'])
  })
  it('does not change the list it was given', () => {
    const input = [t({ id: 'b', size: 'half_day' }), t({ id: 'a', size: 'quick' })]
    sortPickupTasks(input)
    expect(input.map((x) => x.id)).toEqual(['b', 'a'])
  })
})

describe('slotsLeft', () => {
  it('is the limit minus what you hold, never below zero', () => {
    expect(MAX_PICKUP_TASKS).toBe(2)
    expect(slotsLeft(0)).toBe(2)
    expect(slotsLeft(1)).toBe(1)
    expect(slotsLeft(2)).toBe(0)
    expect(slotsLeft(5)).toBe(0)
  })
})

describe('daysWaiting / waitingLabel', () => {
  const now = new Date('2026-10-10T12:00:00Z')
  it('counts whole days and never goes negative', () => {
    expect(daysWaiting('2026-10-10T01:00:00Z', now)).toBe(0)
    expect(daysWaiting('2026-10-09T11:00:00Z', now)).toBe(1)
    expect(daysWaiting('2026-09-30T12:00:00Z', now)).toBe(10)
    expect(daysWaiting('2026-10-20T12:00:00Z', now)).toBe(0)
  })
  it('words it plainly', () => {
    expect(waitingLabel(0)).toBe('New today')
    expect(waitingLabel(1)).toBe('Waiting 1 day')
    expect(waitingLabel(12)).toBe('Waiting 12 days')
  })
})

describe('isTaskSize', () => {
  it('accepts only the three sizes', () => {
    expect(isTaskSize('quick')).toBe(true)
    expect(isTaskSize('half_day')).toBe(true)
    expect(isTaskSize('huge')).toBe(false)
    expect(isTaskSize(null)).toBe(false)
  })
})

describe('canSetTaskSize', () => {
  it('allows the subsystem lead, the COO and cto/admin, and nobody else', () => {
    expect(canSetTaskSize({ isCtoOrAdmin: true, isCoo: false, leadsSubsystem: false })).toBe(true)
    expect(canSetTaskSize({ isCtoOrAdmin: false, isCoo: true, leadsSubsystem: false })).toBe(true)
    expect(canSetTaskSize({ isCtoOrAdmin: false, isCoo: false, leadsSubsystem: true })).toBe(true)
    expect(canSetTaskSize({ isCtoOrAdmin: false, isCoo: false, leadsSubsystem: false })).toBe(false)
  })
})

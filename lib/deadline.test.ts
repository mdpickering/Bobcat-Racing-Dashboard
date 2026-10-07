import { describe, expect, it } from 'vitest'
import { deadlineDateKey, formatDeadline, isDeadlineDueSoon, isDeadlineOverdue, todayDateKey } from './deadline'

// Task deadlines are stored as midnight UTC of a calendar date; "today" is the viewer's own calendar date.
const TODAY = new Date(2026, 9, 6, 15, 30) // Oct 6, 2026, local, mid-afternoon

describe('deadlineDateKey', () => {
  it('returns the UTC calendar date of a stored deadline', () => {
    expect(deadlineDateKey('2026-10-06T00:00:00.000Z')).toBe('2026-10-06')
  })
  it('returns null for empty or invalid values', () => {
    expect(deadlineDateKey(null)).toBeNull()
    expect(deadlineDateKey(undefined)).toBeNull()
    expect(deadlineDateKey('')).toBeNull()
    expect(deadlineDateKey('not a date')).toBeNull()
  })
})

describe('formatDeadline', () => {
  it('shows the stored date, not the viewer-shifted one', () => {
    const text = formatDeadline('2026-10-06T00:00:00.000Z', { month: 'short', day: 'numeric' })
    expect(text).toContain('6')
    expect(text).not.toContain('5')
  })
  it('shows a dash when there is no deadline', () => {
    expect(formatDeadline(null)).toBe('—')
  })
})

describe('todayDateKey', () => {
  it('is the local calendar date as YYYY-MM-DD', () => {
    expect(todayDateKey(TODAY)).toBe('2026-10-06')
  })
})

describe('isDeadlineOverdue', () => {
  it('is overdue once the date is strictly before today', () => {
    expect(isDeadlineOverdue('2026-10-05T00:00:00.000Z', 'To Do', TODAY)).toBe(true)
  })
  it('a task due today is not overdue', () => {
    expect(isDeadlineOverdue('2026-10-06T00:00:00.000Z', 'To Do', TODAY)).toBe(false)
  })
  it('a task due in the future is not overdue', () => {
    expect(isDeadlineOverdue('2026-10-07T00:00:00.000Z', 'In Progress', TODAY)).toBe(false)
  })
  it('a completed task is never overdue', () => {
    expect(isDeadlineOverdue('2026-01-01T00:00:00.000Z', 'Complete', TODAY)).toBe(false)
  })
  it('a task with no deadline is never overdue', () => {
    expect(isDeadlineOverdue(null, 'To Do', TODAY)).toBe(false)
  })
})

describe('isDeadlineDueSoon', () => {
  it('includes today and the last day of the window', () => {
    expect(isDeadlineDueSoon('2026-10-06T00:00:00.000Z', 'To Do', 7, TODAY)).toBe(true)
    expect(isDeadlineDueSoon('2026-10-13T00:00:00.000Z', 'To Do', 7, TODAY)).toBe(true)
  })
  it('excludes the day after the window and anything already overdue', () => {
    expect(isDeadlineDueSoon('2026-10-14T00:00:00.000Z', 'To Do', 7, TODAY)).toBe(false)
    expect(isDeadlineDueSoon('2026-10-05T00:00:00.000Z', 'To Do', 7, TODAY)).toBe(false)
  })
  it('ignores completed and undated tasks', () => {
    expect(isDeadlineDueSoon('2026-10-08T00:00:00.000Z', 'Complete', 7, TODAY)).toBe(false)
    expect(isDeadlineDueSoon(null, 'To Do', 7, TODAY)).toBe(false)
  })
})

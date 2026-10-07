import { describe, expect, it } from 'vitest'
import { addDaysToKey, bucketFor, daysBetweenKeys, deadlineCounts, groupDeadlines, relativeDeadline, sortByAttention, subsystemSchedule } from './operationsSchedule'

const TODAY = '2026-10-06'
const at = (key: string) => `${key}T00:00:00.000Z`

describe('date arithmetic', () => {
  it('adds days across month and year ends', () => {
    expect(addDaysToKey('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysToKey('2026-10-06', -6)).toBe('2026-09-30')
  })
  it('counts whole days between keys', () => {
    expect(daysBetweenKeys('2026-10-06', '2026-10-13')).toBe(7)
    expect(daysBetweenKeys('2026-10-06', '2026-10-01')).toBe(-5)
  })
})

describe('bucketFor', () => {
  it.each([
    ['2026-10-05', 'overdue'],
    ['2026-10-06', 'today'],
    ['2026-10-07', 'tomorrow'],
    ['2026-10-08', 'next_7'],
    ['2026-10-13', 'next_7'],
    ['2026-10-14', 'following_7'],
    ['2026-10-20', 'following_7'],
    ['2026-10-21', 'later'],
  ])('%s is %s', (key, bucket) => {
    expect(bucketFor(at(key), TODAY)).toBe(bucket)
  })
  it('puts undated tasks in "none"', () => {
    expect(bucketFor(null, TODAY)).toBe('none')
  })
})

describe('groupDeadlines and deadlineCounts', () => {
  const tasks = [
    { id: 'a', deadline: at('2026-10-20') },
    { id: 'b', deadline: null },
    { id: 'c', deadline: at('2026-09-29') },
    { id: 'd', deadline: at('2026-10-05') },
    { id: 'e', deadline: at('2026-10-06') },
  ]
  it('orders groups fixed and tasks soonest first (oldest overdue on top)', () => {
    const groups = groupDeadlines(tasks, TODAY)
    expect(groups.map((g) => g.bucket)).toEqual(['overdue', 'today', 'tomorrow', 'next_7', 'following_7', 'later', 'none'])
    expect(groups[0].tasks.map((t) => t.id)).toEqual(['c', 'd'])
    expect(groups[1].tasks.map((t) => t.id)).toEqual(['e'])
    expect(groups[4].tasks.map((t) => t.id)).toEqual(['a'])
    expect(groups[6].tasks.map((t) => t.id)).toEqual(['b'])
  })
  it('counts each bucket', () => {
    expect(deadlineCounts(tasks, TODAY)).toEqual({ overdue: 2, today: 1, tomorrow: 0, next_7: 0, following_7: 1, later: 0, none: 1 })
  })
})

describe('relativeDeadline', () => {
  it('describes a deadline relative to today', () => {
    expect(relativeDeadline(null, TODAY)).toBe('No deadline')
    expect(relativeDeadline(at('2026-10-06'), TODAY)).toBe('Today')
    expect(relativeDeadline(at('2026-10-07'), TODAY)).toBe('Tomorrow')
    expect(relativeDeadline(at('2026-10-05'), TODAY)).toBe('1 day overdue')
    expect(relativeDeadline(at('2026-09-29'), TODAY)).toBe('7 days overdue')
    expect(relativeDeadline(at('2026-10-10'), TODAY)).toBe('In 4 days')
  })
})

describe('subsystemSchedule and sortByAttention', () => {
  const subsystems = [
    { id: 's1', name: 'Steering' },
    { id: 's2', name: 'Brakes' },
    { id: 's3', name: 'Frame' },
  ]
  const tasks = [
    { id: '1', title: 'Late', status: 'To Do', deadline: at('2026-10-01'), subsystem_id: 's1' },
    { id: '2', title: 'Soon', status: 'In Progress', deadline: at('2026-10-08'), subsystem_id: 's1' },
    { id: '3', title: 'Undated', status: 'To Do', deadline: null, subsystem_id: 's2' },
    { id: '4', title: 'Done', status: 'Complete', deadline: at('2026-09-01'), subsystem_id: 's1' },
  ]
  const rows = subsystemSchedule(subsystems, tasks, [], [], TODAY, new Date('2026-10-06T12:00:00Z'))

  it('counts only open tasks per subsystem', () => {
    const steering = rows.find((r) => r.subsystemId === 's1')!
    expect(steering.open).toBe(2)
    expect(steering.overdue).toBe(1)
    expect(steering.dueNext7).toBe(1)
    expect(steering.nextDeadline?.taskId).toBe('2')
    expect(steering.attention).toEqual([{ kind: 'overdue', count: 1 }])
    const brakes = rows.find((r) => r.subsystemId === 's2')!
    expect(brakes.noDeadline).toBe(1)
    expect(brakes.attention).toEqual([{ kind: 'unscheduled', count: 1 }])
  })
  it('sorts the subsystems that need a look first', () => {
    expect(sortByAttention(rows).map((r) => r.subsystemId)).toEqual(['s1', 's2', 's3'])
  })
})

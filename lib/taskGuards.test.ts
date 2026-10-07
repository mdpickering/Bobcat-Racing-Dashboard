import { describe, expect, it } from 'vitest'
import { pastDateNote, planningGaps, startNudge } from './taskGuards'

const dated = '2026-12-01T00:00:00.000Z'

describe('planningGaps', () => {
  it('lists what an open task is missing', () => {
    expect(planningGaps({ status: 'To Do', deadline: null, primary_owner_id: null })).toEqual(['No deadline', 'No owner'])
    expect(planningGaps({ status: 'To Do', deadline: dated, primary_owner_id: null })).toEqual(['No owner'])
    expect(planningGaps({ status: 'In Progress', deadline: null, primary_owner_id: 'u1' })).toEqual(['No deadline'])
    expect(planningGaps({ status: 'Blocked', deadline: dated, primary_owner_id: 'u1' })).toEqual([])
  })
  it('never flags a completed task', () => {
    expect(planningGaps({ status: 'Complete', deadline: null, primary_owner_id: null })).toEqual([])
  })
})

describe('startNudge', () => {
  it('warns when a task with no deadline and no owner is started', () => {
    expect(startNudge({ deadline: null, primary_owner_id: null }, 'In Progress')).toMatch(/no deadline and no owner/)
  })
  it('names only the missing piece', () => {
    expect(startNudge({ deadline: null, primary_owner_id: 'u1' }, 'In Progress')).toMatch(/no deadline yet/)
    expect(startNudge({ deadline: dated, primary_owner_id: null }, 'Review')).toMatch(/Nobody owns/)
  })
  it('says nothing for a fully planned task or for other statuses', () => {
    expect(startNudge({ deadline: dated, primary_owner_id: 'u1' }, 'In Progress')).toBeNull()
    expect(startNudge({ deadline: null, primary_owner_id: null }, 'To Do')).toBeNull()
    expect(startNudge({ deadline: null, primary_owner_id: null }, 'Complete')).toBeNull()
    expect(startNudge({ deadline: null, primary_owner_id: null }, 'Blocked')).toBeNull()
  })
})

describe('pastDateNote', () => {
  it('flags a date that has already passed', () => {
    expect(pastDateNote('2000-01-01', 'To Do')).toMatch(/already passed/)
  })
  it('stays quiet for a future date, no date, or a completed task', () => {
    expect(pastDateNote('2999-01-01', 'To Do')).toBeNull()
    expect(pastDateNote(null, 'To Do')).toBeNull()
    expect(pastDateNote('2000-01-01', 'Complete')).toBeNull()
  })
})

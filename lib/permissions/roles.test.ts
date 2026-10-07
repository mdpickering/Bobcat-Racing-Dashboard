import { describe, expect, it } from 'vitest'
import type { UserRole } from '@/types/user'
import { canManageInventory, canManageMeetings, canManageOperations, canRecordMeetingNotes, canReverseReceipt, isCtoOrAdmin } from './roles'

const as = (role: UserRole) => ({ role })

describe('role gates (these mirror the database functions, which are the real enforcement)', () => {
  it('Operations is the COO, CTO and admin, nobody else', () => {
    expect(canManageOperations(as('coo'))).toBe(true)
    expect(canManageOperations(as('cto'))).toBe(true)
    expect(canManageOperations(as('admin'))).toBe(true)
    expect(canManageOperations(as('team_lead'))).toBe(false)
    expect(canManageOperations(as('member'))).toBe(false)
    expect(canManageOperations(null)).toBe(false)
  })
  it('the COO records meetings but does not manage them', () => {
    expect(canManageMeetings(as('coo'))).toBe(false)
    expect(canRecordMeetingNotes(as('coo'))).toBe(true)
    expect(canManageMeetings(as('cto'))).toBe(true)
    expect(canRecordMeetingNotes(as('team_lead'))).toBe(false)
  })
  it('reversing a receipt is CTO or admin only', () => {
    expect(canReverseReceipt(as('admin'))).toBe(true)
    expect(canReverseReceipt(as('coo'))).toBe(false)
    expect(canManageInventory(as('coo'))).toBe(true)
  })
  it('isCtoOrAdmin excludes the COO', () => {
    expect(isCtoOrAdmin(as('coo'))).toBe(false)
    expect(isCtoOrAdmin(as('cto'))).toBe(true)
  })
})

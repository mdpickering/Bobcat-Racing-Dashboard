import type { Profile, UserRole } from '@/types/user'

export function isAdmin(profile: Pick<Profile, 'role'> | null | undefined): boolean {
  return profile?.role === 'admin'
}

export function isCto(profile: Pick<Profile, 'role'> | null | undefined): boolean {
  return profile?.role === 'cto'
}

export function isCtoOrAdmin(profile: Pick<Profile, 'role'> | null | undefined): boolean {
  return profile?.role === 'cto' || profile?.role === 'admin'
}

export function isTeamLead(profile: Pick<Profile, 'role'> | null | undefined): boolean {
  return profile?.role === 'team_lead'
}

export function isCoo(profile: Pick<Profile, 'role'> | null | undefined): boolean {
  return profile?.role === 'coo'
}

/**
 * Who may manage the shared operations schedule (calendar events, recurring events, milestones,
 * the master timeline, and task deadlines): the COO, plus cto/admin. Mirrors
 * public.can_manage_operations() (migration 0028), which is the real enforcement — this only
 * decides what to show. It grants no user-management, purchasing or CAD authority.
 */
export function canManageOperations(profile: Pick<Profile, 'role'> | null | undefined): boolean {
  return isCoo(profile) || isCtoOrAdmin(profile)
}

/**
 * Who may approve or decline a task request: cto/admin for any subsystem, or a team lead
 * (profile role 'team_lead') for the subsystems they lead. A plain member never can, even if
 * they were flagged as a subsystem lead. Mirrors public.can_review_task_request() (migration
 * 0022), which is the real enforcement — this only decides whether to show the buttons.
 */
export function canReviewTaskRequest(
  profile: Pick<Profile, 'role'> | null | undefined,
  ledSubsystemIds: ReadonlySet<string>,
  subsystemId: string
): boolean {
  if (isCtoOrAdmin(profile)) return true
  return isTeamLead(profile) && ledSubsystemIds.has(subsystemId)
}

/**
 * Who may administer inventory broadly: opening balances, locations, and receiving/adjusting/transferring for
 * ANY subsystem's parts. Mirrors public.can_manage_inventory() (migration 0038), which reuses
 * can_manage_operations() itself — so this is exactly the COO plus cto/admin, nothing more, nothing less.
 */
export function canManageInventory(profile: Pick<Profile, 'role'> | null | undefined): boolean {
  return canManageOperations(profile)
}

/**
 * The shared shape of "manage inventory for ANY subsystem, or be the lead of THIS ONE": mirrors
 * public.can_receive_purchase() and public.can_adjust_part_stock() (migration 0038), which are both exactly
 * this rule. Reversal (public.reverse_purchase_receipt_line) and locations/opening-balance are cto/admin (and
 * cto/admin only, or cto/admin + COO respectively) — narrower than this, and have their own checks above.
 */
function canManageInventoryForSubsystem(
  profile: Pick<Profile, 'role'> | null | undefined,
  ledSubsystemIds: ReadonlySet<string> | readonly string[],
  subsystemId: string
): boolean {
  if (canManageInventory(profile)) return true
  const led = ledSubsystemIds instanceof Set ? ledSubsystemIds : new Set(ledSubsystemIds)
  return isTeamLead(profile) && led.has(subsystemId)
}

/** Who may receive against a purchase request in this subsystem: the COO/cto/admin for any, or its own lead. */
export function canReceivePurchase(
  profile: Pick<Profile, 'role'> | null | undefined,
  ledSubsystemIds: ReadonlySet<string> | readonly string[],
  subsystemId: string
): boolean {
  return canManageInventoryForSubsystem(profile, ledSubsystemIds, subsystemId)
}

/** Who may adjust/write off/transfer a part's stock: the COO/cto/admin for any part, or the lead of its subsystem. */
export function canAdjustPartStock(
  profile: Pick<Profile, 'role'> | null | undefined,
  ledSubsystemIds: ReadonlySet<string> | readonly string[],
  subsystemId: string
): boolean {
  return canManageInventoryForSubsystem(profile, ledSubsystemIds, subsystemId)
}

/**
 * Reversing a receipt is narrower than everything else here: cto/admin only, not the COO. Opening balances and
 * location management stay at canManageInventory() (COO included) — use that directly for those.
 */
export function canReverseReceipt(profile: Pick<Profile, 'role'> | null | undefined): boolean {
  return isCtoOrAdmin(profile)
}

/**
 * Who may manage a technical meeting: create it, build/reorder its agenda, delete an empty draft,
 * or correct a completed one. Mirrors public.can_manage_meetings() (migration 0041) — cto/admin
 * ONLY. This is deliberately narrower than canManageOperations(): unlike every other "operations"
 * capability in this file, the COO is NOT included here. The COO is the meeting recorder, not its
 * owner — see canRecordMeetingNotes() below.
 */
export function canManageMeetings(profile: Pick<Profile, 'role'> | null | undefined): boolean {
  return isCtoOrAdmin(profile)
}

/**
 * Who may act as meeting scribe: record discussion notes/decisions, create action items, and turn
 * one into a real task. Mirrors public.can_record_meeting_notes() (migration 0041) — the COO, plus
 * cto/admin (every manager is also a recorder). A plain team lead or member gets neither; they can
 * only read a completed meeting's history once it exists.
 */
export function canRecordMeetingNotes(profile: Pick<Profile, 'role'> | null | undefined): boolean {
  return isCoo(profile) || isCtoOrAdmin(profile)
}

export function hasRole(
  profile: Pick<Profile, 'role'> | null | undefined,
  roles: UserRole[]
): boolean {
  return !!profile && roles.includes(profile.role)
}

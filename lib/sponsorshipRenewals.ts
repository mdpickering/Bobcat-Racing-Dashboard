import type { RenewalState } from '@/types/database'

// The rules live in the database (migration 0036: the scan, the ledger, the status view). Everything here is
// wording and presentation, kept next to the constants it must agree with (checked against the migration in tests).

// 60, 30 and 7 days before the renewal date, each at most once per renewal date.
export const RENEWAL_THRESHOLDS = [60, 30, 7] as const

export const RENEWAL_STATE_LABEL: Record<RenewalState, string> = {
  not_applicable: 'Not applicable',
  no_date: 'No renewal date',
  scheduled: 'Renewal scheduled',
  approaching: 'Renewal approaching',
  overdue: 'Renewal overdue',
  renewed: 'Renewed',
}

// What the state means for reminders, in one sentence for the detail panel.
export function renewalStateHelp(state: RenewalState, recipients: number | null): string {
  switch (state) {
    case 'not_applicable':
      return 'Renewal reminders apply to Committed sponsorships. This one is not Committed, so none will be sent.'
    case 'no_date':
      return 'No renewal date is set, so no reminders will be sent. Set a date to turn them on.'
    case 'renewed':
      return 'A later season is already Committed for this sponsor, so no reminders will be sent.'
    case 'overdue':
      return 'The renewal date has passed. Reminders are only sent before the date, so no more will be sent.'
    case 'approaching':
    case 'scheduled':
      return recipients === 0
        ? 'Reminders are set up, but nobody would receive one: assign a responsible person or appoint a Sponsorship Lead.'
        : 'Reminders are on: 60, 30 and 7 days before the renewal date, each sent once.'
  }
}

export function daysRemainingLabel(days: number | null | undefined): string | null {
  if (days == null) return null
  if (days === 0) return 'Renews today'
  if (days === 1) return '1 day remaining'
  if (days > 1) return `${days} days remaining`
  return days === -1 ? '1 day overdue' : `${-days} days overdue`
}

// The database writes the renewal notification's message in a fixed three-line shape (see
// enqueue_sponsorship_renewal_reminders in 0036):
//   <Sponsor> — <Level>            (the " — <Level>" part is left out when there is no standard level)
//   Renewal: <Month d, yyyy> · <N days remaining | 1 day remaining | renews today>
//   Responsible: <name | not assigned>
// The email reads it back so it can show the details as a small table; the tests feed real database output through this.
export interface RenewalMessage {
  sponsor: string
  level: string | null
  renewalDate: string
  remaining: string
  daysRemaining: number | null
  responsible: string
}

export function parseRenewalMessage(message: string | null | undefined): RenewalMessage | null {
  if (!message) return null
  const lines = message.split('\n').map((l) => l.trim())
  if (lines.length < 3) return null
  const [head, when, who] = lines
  const whenMatch = /^Renewal: (.+) · (renews today|1 day remaining|(\d+) days remaining)$/.exec(when)
  const whoMatch = /^Responsible: (.+)$/.exec(who)
  if (!head || !whenMatch || !whoMatch) return null
  const cut = head.lastIndexOf(' — ')
  return {
    sponsor: cut === -1 ? head : head.slice(0, cut),
    level: cut === -1 ? null : head.slice(cut + 3),
    renewalDate: whenMatch[1],
    remaining: whenMatch[2],
    daysRemaining: whenMatch[2] === 'renews today' ? 0 : whenMatch[2] === '1 day remaining' ? 1 : Number(whenMatch[3]),
    responsible: whoMatch[1],
  }
}

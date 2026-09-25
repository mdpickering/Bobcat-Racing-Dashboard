// One meaning per colour, in every workspace:
//   success (green)  complete, healthy, received
//   warning (yellow) pending, needs attention
//   danger  (red)    overdue, error, problem
//   info    (blue)   informational, active
//   neutral (grey)   no state / not started / archived
//   brand   (gold)   Bobcat emphasis only (levels, "current"); never a status
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand'

export const STATUS_TONES: StatusTone[] = ['success', 'warning', 'danger', 'info', 'neutral', 'brand']

// Text is always shown with the colour (and, where helpful, an icon), so colour is never the only signal.
export const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-status-success/15 text-status-success border-status-success/30',
  warning: 'bg-status-warning/15 text-status-warning border-status-warning/30',
  danger: 'bg-status-danger/15 text-status-danger border-status-danger/30',
  info: 'bg-status-info/15 text-status-info border-status-info/30',
  neutral: 'bg-text-secondary/10 text-text-secondary border-border',
  brand: 'bg-accent/15 text-accent border-accent/30',
}

// Text colour alone, for figures and inline status words.
export const STATUS_TEXT_CLASSES: Record<StatusTone, string> = {
  success: 'text-status-success',
  warning: 'text-status-warning',
  danger: 'text-status-danger',
  info: 'text-status-info',
  neutral: 'text-text-secondary',
  brand: 'text-accent',
}

// Domain registry: which tone each existing status value gets. Pages adopt this as they are restyled (the existing
// per-page badge maps are replaced by it); it exists now so the meaning is defined once, before any page moves.
export const STATUS_REGISTRY = {
  task: {
    'To Do': 'neutral',
    'In Progress': 'info',
    Blocked: 'danger',
    Review: 'warning',
    Complete: 'success',
  },
  priority: {
    Critical: 'danger',
    High: 'warning',
    Medium: 'info',
    Low: 'neutral',
  },
  cad: {
    Draft: 'neutral',
    'Submitted for Review': 'info',
    'Changes Requested': 'warning',
    Approved: 'success',
    'Approved for Manufacturing': 'brand',
  },
  purchase: {
    Draft: 'neutral',
    Submitted: 'warning',
    'Under Review': 'warning',
    Approved: 'success',
    Ordered: 'info',
    'In Transit': 'info',
    'Arrived in Shop': 'success',
    Completed: 'success',
    Rejected: 'danger',
    Cancelled: 'neutral',
  },
  sponsorshipStage: {
    prospect: 'neutral',
    contacted: 'info',
    interested: 'warning',
    committed: 'success',
    declined: 'danger',
    withdrawn: 'danger',
  },
  levelReview: {
    ok: 'success',
    qualifies_higher: 'warning',
    below_minimum: 'danger',
    exception_recorded: 'info',
    custom: 'neutral',
    historical_unassigned: 'neutral',
    none_recorded: 'neutral',
  },
  payment: {
    available: 'success',
    held_by_university: 'warning',
    unknown: 'neutral',
  },
} as const satisfies Record<string, Record<string, StatusTone>>

export type StatusDomain = keyof typeof STATUS_REGISTRY

export function statusTone(domain: StatusDomain, value: string): StatusTone {
  const map = STATUS_REGISTRY[domain] as Record<string, StatusTone>
  return map[value] ?? 'neutral'
}

import type {
  ContributionKind,
  DeliverableStatus,
  InKindType,
  LevelDecisionMethod,
  LevelReviewFlag,
  PaymentAvailability,
  PaymentMethod,
  PaymentReceivedBy,
  SponsorType,
  SponsorshipLevel,
  SponsorshipStage,
} from '@/types/database'

// ---------------------------------------------------------
// Seasons
// ---------------------------------------------------------
// Seasons are the existing competition_settings.season keys, stored as "2026-2027" (ASCII hyphen, safe in URLs and
// for sorting) and shown as "2026–2027".
export function seasonLabel(season: string): string {
  return /^\d{4}-\d{4}$/.test(season) ? season.replace('-', '–') : season
}

// "2026–27" for button labels.
export function seasonShort(season: string): string {
  const m = /^(\d{4})-(\d{2})(\d{2})$/.exec(season)
  return m ? `${m[1]}–${m[3]}` : season
}

// A season that ended before the current one. Its records are history: no program is offered for it and any
// level stays unassigned unless someone deliberately assigns one.
export function isHistoricalSeason(season: string, currentSeason: string | null): boolean {
  return !!currentSeason && /^\d{4}-\d{4}$/.test(season) && /^\d{4}-\d{4}$/.test(currentSeason) && season < currentSeason
}

// ---------------------------------------------------------
// Money
// ---------------------------------------------------------
export function formatMoney(value: number | null | undefined): string {
  const n = Number(value ?? 0)
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })
}

// Postgres numeric comes back from PostgREST as a number, but be defensive about strings.
export function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

// Historical records only know the month; show "Oct 2023", not "Oct 1, 2023".
export function formatContributionDate(date: string | null | undefined, precision: 'day' | 'month' = 'day'): string {
  if (!date) return '—'
  // date-only strings must not be shifted by the viewer's timezone
  const [y, m, d] = date.slice(0, 10).split('-').map(Number)
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1)
  return dt.toLocaleDateString(undefined, precision === 'month' ? { month: 'short', year: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}

// ---------------------------------------------------------
// The 2026–2027 flyer program. This MUST match public.create_sponsorship_program() in migration 0034, which is what
// actually creates the levels; it is only used to preview what will be created (and is checked against the
// database in the tests).
// ---------------------------------------------------------
export interface FlyerLevel {
  key: string
  name: string
  minAmount: number
  deliverables: string[]
}

export const FLYER_PROGRAM: FlyerLevel[] = [
  {
    key: 'platinum',
    name: 'Platinum',
    minAmount: 3000,
    deliverables: ['Logo received', 'Logo approved', 'Large logo on trailer', 'Large logo on car', 'Large logo on T-shirts', 'Post-race Thank You plaque'],
  },
  {
    key: 'bobcat_gold',
    name: 'Bobcat Gold',
    minAmount: 1500,
    deliverables: ['Logo received', 'Logo approved', 'Medium logo on trailer', 'Medium logo on car', 'Medium logo on T-shirts'],
  },
  {
    key: 'qu_navy',
    name: 'QU Navy',
    minAmount: 500,
    deliverables: ['Logo received', 'Logo approved', 'Small logo on car', 'Small logo on T-shirt'],
  },
  {
    key: 'qu_sky_blue',
    name: 'QU Sky Blue',
    minAmount: 250,
    deliverables: ['Name confirmed', 'Name on car', 'Name on T-shirt'],
  },
]

// ---------------------------------------------------------
// Level qualification (display only: set_sponsorship_level() recomputes this from the live contributions itself)
// ---------------------------------------------------------
export interface Qualification {
  cash: number
  inKind: number
  total: number
  minimum: number | null
  qualifies: boolean | null
  shortfall: number
}

export function qualify(cash: number, inKind: number, level: Pick<SponsorshipLevel, 'min_amount'> | null): Qualification {
  const total = cash + inKind
  if (!level) return { cash, inKind, total, minimum: null, qualifies: null, shortfall: 0 }
  const minimum = toNumber(level.min_amount)
  return { cash, inKind, total, minimum, qualifies: total >= minimum, shortfall: Math.max(minimum - total, 0) }
}

// The highest level the qualifying total reaches (what the review view suggests).
export function highestQualifyingLevel(total: number, levels: SponsorshipLevel[]): SponsorshipLevel | null {
  return [...levels].filter((l) => l.active && toNumber(l.min_amount) <= total).sort((a, b) => toNumber(b.min_amount) - toNumber(a.min_amount))[0] ?? null
}

// ---------------------------------------------------------
// Labels
// ---------------------------------------------------------
type Tone = 'emerald' | 'gold' | 'rose' | 'sky' | 'slate' | 'amber'

export const STAGES: SponsorshipStage[] = ['prospect', 'contacted', 'interested', 'committed', 'declined', 'withdrawn']

export const STAGE_LABEL: Record<SponsorshipStage, string> = {
  prospect: 'Prospect',
  contacted: 'Contacted',
  interested: 'Interested',
  committed: 'Committed',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
}

export const STAGE_TONE: Record<SponsorshipStage, Tone> = {
  prospect: 'slate',
  contacted: 'sky',
  interested: 'amber',
  committed: 'emerald',
  declined: 'rose',
  withdrawn: 'rose',
}

export const SPONSOR_TYPE_LABEL: Record<SponsorType, string> = {
  company: 'Company',
  foundation: 'Foundation',
  family_or_individual: 'Family / individual',
  other: 'Other',
}

export const IN_KIND_TYPE_LABEL: Record<InKindType, string> = {
  discount: 'Discount',
  components_products: 'Components / products',
  tool: 'Tool',
  software: 'Software',
  service: 'Service',
  other: 'Other',
}

export const CONTRIBUTION_KIND_LABEL: Record<ContributionKind, string> = { cash: 'Cash', in_kind: 'In-kind' }

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  check: 'Check',
  cash: 'Cash',
  card: 'Card',
  wire_ach: 'Wire / ACH',
  university_giving: 'University giving',
  other: 'Other',
  unknown: 'Unknown',
}

export const RECEIVED_BY_LABEL: Record<PaymentReceivedBy, string> = { university: 'The university', team: 'The team', unknown: 'Unknown' }

export const AVAILABILITY_LABEL: Record<PaymentAvailability, string> = {
  held_by_university: 'Held by the university',
  available: 'Available to the team',
  unknown: 'Unknown',
}

export const AVAILABILITY_TONE: Record<PaymentAvailability, Tone> = { held_by_university: 'amber', available: 'emerald', unknown: 'slate' }

export const DECISION_METHOD_LABEL: Record<LevelDecisionMethod, string> = {
  qualified: 'Qualified',
  exception: 'Exception (below minimum)',
  custom: 'Custom sponsorship',
  historical_unassigned: 'Historical — level not assigned',
}

export const REVIEW_FLAG_LABEL: Record<LevelReviewFlag, { label: string; tone: Tone; help: string }> = {
  ok: { label: 'Level OK', tone: 'emerald', help: 'The recorded level matches what the contributions qualify for.' },
  qualifies_higher: { label: 'Qualifies higher', tone: 'amber', help: 'Contributions now reach a higher level than the one recorded. Review it; nothing changes automatically.' },
  below_minimum: { label: 'Below minimum', tone: 'rose', help: 'Contributions have dropped below the recorded level’s minimum since it was set. Review it; nothing changes automatically.' },
  exception_recorded: { label: 'Exception', tone: 'sky', help: 'Below the level minimum on purpose; the reason is recorded in the level history.' },
  custom: { label: 'Custom', tone: 'slate', help: 'A custom sponsorship with its own terms.' },
  historical_unassigned: { label: 'Historical — no level', tone: 'slate', help: 'A historical record. No level has been assigned and none was invented.' },
  none_recorded: { label: 'No level yet', tone: 'slate', help: 'No level decision has been recorded.' },
}

// ---------------------------------------------------------
// Deliverables (migration 0035)
// ---------------------------------------------------------
export const DELIVERABLE_STATUSES: DeliverableStatus[] = ['not_started', 'in_progress', 'complete']

export const DELIVERABLE_STATUS_LABEL: Record<DeliverableStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  complete: 'Complete',
}

// Overdue = not complete and due strictly before today (a deliverable due today is not overdue). `today` is a
// 'YYYY-MM-DD' key in the viewer's own calendar.
export function isDeliverableOverdue(d: { status: DeliverableStatus; due_date: string | null }, today: string | null): boolean {
  return !!today && !!d.due_date && d.status !== 'complete' && d.due_date.slice(0, 10) < today
}

// "3 / 6 complete". A sponsorship with no deliverables has no progress at all, so this is only called with a row.
export function deliverableProgressLabel(p: { completed: number; total: number }): string {
  return `${p.completed} / ${p.total} complete`
}

// Flags that mean someone should look at the level.
export const NEEDS_REVIEW_FLAGS: LevelReviewFlag[] = ['qualifies_higher', 'below_minimum']

// A Committed sponsorship without a decision cannot exist (the database refuses), so "none_recorded" only appears
// earlier in the pipeline and is not worth an alarm there.

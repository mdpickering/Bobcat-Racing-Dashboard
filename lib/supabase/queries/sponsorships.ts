import type { SupabaseClient } from '@supabase/supabase-js'
import { getBusinessAccess } from '@/lib/supabase/queries/business'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import { toNumber } from '@/lib/sponsorships'
import type {
  ContributionKind,
  DatePrecision,
  DeliverableStatus,
  InKindType,
  PaymentEntryType,
  PaymentMethod,
  PaymentReceivedBy,
  PaymentAvailability,
  Sponsor,
  SponsorContact,
  SponsorType,
  Sponsorship,
  SponsorshipContribution,
  SponsorshipDeliverable,
  SponsorshipDeliverableProgress,
  SponsorshipHistoryEntry,
  SponsorshipLevel,
  SponsorshipLevelDecision,
  SponsorshipLevelReview,
  SponsorshipPayment,
  SponsorshipStage,
  SponsorshipSummary,
  CompetitionSettings,
} from '@/types/database'
import type { Profile } from '@/types/user'

type PersonRef = { id: string; display_name: string | null; email: string | null }

// PostgREST says PGRST205 (or Postgres 42P01) when a table/view is not in the schema yet: the one case where the
// deliverables reads may quietly return nothing (the page then behaves as it did before migration 0035).
function isMissingRelation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === 'PGRST205' || code === '42P01'
}

// ---------------------------------------------------------
// Access
// ---------------------------------------------------------
export interface SponsorshipAccess {
  // see the Business area: Business members, the COO (read-only) and cto/admin
  canView: boolean
  // change anything: the Sponsorship Lead, the Business Lead and cto/admin. Mirrors public.can_manage_sponsorships()
  // (migration 0034); the database is the real gate and this only decides which buttons to show.
  canManage: boolean
}

export async function getSponsorshipAccess(supabase: SupabaseClient, profile: Pick<Profile, 'id' | 'role'>): Promise<SponsorshipAccess> {
  const business = await getBusinessAccess(supabase, profile)
  return {
    canView: business.canView,
    canManage: isCtoOrAdmin(profile) || business.isLead || business.responsibilities.includes('sponsorship_lead'),
  }
}

// ---------------------------------------------------------
// Reads
// ---------------------------------------------------------
export async function listSeasons(supabase: SupabaseClient): Promise<Pick<CompetitionSettings, 'season' | 'competition_name' | 'competition_date'>[]> {
  const { data, error } = await supabase.from('competition_settings').select('season, competition_name, competition_date').order('season', { ascending: false })
  if (error) throw error
  return (data ?? []) as Pick<CompetitionSettings, 'season' | 'competition_name' | 'competition_date'>[]
}

function normalizeLevel(row: SponsorshipLevel): SponsorshipLevel {
  return {
    ...row,
    min_amount: toNumber(row.min_amount),
    deliverables: [...(row.deliverables ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title)),
  }
}

export async function listSponsorshipLevels(supabase: SupabaseClient, season: string): Promise<SponsorshipLevel[]> {
  const { data, error } = await supabase
    .from('sponsorship_levels')
    .select('*, deliverables:sponsorship_level_deliverables(*)')
    .eq('season', season)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return ((data ?? []) as unknown as SponsorshipLevel[]).map(normalizeLevel)
}

function normalizeSummary(row: SponsorshipSummary): SponsorshipSummary {
  return {
    ...row,
    cash_committed: toNumber(row.cash_committed),
    cash_received: toNumber(row.cash_received),
    cash_outstanding: toNumber(row.cash_outstanding),
    cash_over_received: toNumber(row.cash_over_received),
    cash_available: toNumber(row.cash_available),
    cash_held_by_university: toNumber(row.cash_held_by_university),
    cash_availability_unknown: toNumber(row.cash_availability_unknown),
    cash_refunded: toNumber(row.cash_refunded),
    in_kind_value: toNumber(row.in_kind_value),
    in_kind_received_value: toNumber(row.in_kind_received_value),
    total_sponsorship_value: toNumber(row.total_sponsorship_value),
  }
}

function normalizeReview(row: SponsorshipLevelReview): SponsorshipLevelReview {
  return { ...row, qualifying_value: toNumber(row.qualifying_value), decision_basis_total: row.decision_basis_total == null ? null : toNumber(row.decision_basis_total) }
}

export interface SponsorshipListRow extends SponsorshipSummary {
  review: SponsorshipLevelReview | null
  // null when the sponsorship has no deliverables at all (historical / not yet levelled): never shown as 0 / 0
  deliverables: SponsorshipDeliverableProgress | null
}

// Everything a season's list needs, read from the database's own derived views (nothing is recomputed here).
export async function listSponsorshipRows(supabase: SupabaseClient, season: string): Promise<SponsorshipListRow[]> {
  const [summaries, reviews] = await Promise.all([
    supabase.from('sponsorship_summary').select('*').eq('season', season).order('sponsor_name', { ascending: true }),
    supabase.from('sponsorship_level_review').select('*').eq('season', season),
  ])
  if (summaries.error) throw summaries.error
  if (reviews.error) throw reviews.error
  const summaryRows = (summaries.data ?? []) as SponsorshipSummary[]
  const reviewById = new Map(((reviews.data ?? []) as SponsorshipLevelReview[]).map((r) => [r.sponsorship_id, normalizeReview(r)]))

  const progressById = new Map<string, SponsorshipDeliverableProgress>()
  if (summaryRows.length > 0) {
    const { data: progress, error: progressError } = await supabase
      .from('sponsorship_deliverable_progress')
      .select('*')
      .in('sponsorship_id', summaryRows.map((s) => s.sponsorship_id))
    // before migration 0035 is applied the view does not exist yet: show no progress rather than break the list
    if (progressError && !isMissingRelation(progressError)) throw progressError
    for (const p of (progress ?? []) as SponsorshipDeliverableProgress[]) progressById.set(p.sponsorship_id, p)
  }

  return summaryRows.map((s) => ({ ...normalizeSummary(s), review: reviewById.get(s.sponsorship_id) ?? null, deliverables: progressById.get(s.sponsorship_id) ?? null }))
}

export async function listSponsors(supabase: SupabaseClient): Promise<Pick<Sponsor, 'id' | 'name' | 'active'>[]> {
  const { data, error } = await supabase.from('sponsors').select('id, name, active').order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Pick<Sponsor, 'id' | 'name' | 'active'>[]
}

export interface SponsorshipDetail {
  sponsorship: Sponsorship & { sponsor: Sponsor; responsible: PersonRef | null }
  summary: SponsorshipSummary
  review: SponsorshipLevelReview | null
  contacts: SponsorContact[]
  contributions: SponsorshipContribution[]
  payments: SponsorshipPayment[]
  decisions: SponsorshipLevelDecision[]
  deliverables: SponsorshipDeliverable[]
  history: SponsorshipHistoryEntry[]
  levels: SponsorshipLevel[]
}

const PERSON_EMBED = 'id, display_name, email'

export async function listSponsorshipDeliverables(supabase: SupabaseClient, sponsorshipId: string): Promise<SponsorshipDeliverable[]> {
  const { data, error } = await supabase
    .from('sponsorship_deliverables')
    .select(
      `*, assignee:profiles!sponsorship_deliverables_assigned_to_fkey(${PERSON_EMBED}), completer:profiles!sponsorship_deliverables_completed_by_fkey(${PERSON_EMBED})`
    )
    .eq('sponsorship_id', sponsorshipId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) {
    if (isMissingRelation(error)) return []
    throw error
  }
  return (data ?? []) as unknown as SponsorshipDeliverable[]
}

export async function getSponsorshipDetail(supabase: SupabaseClient, id: string): Promise<SponsorshipDetail | null> {
  const { data: row, error } = await supabase
    .from('sponsorships')
    .select('*, sponsor:sponsors(*), responsible:profiles!sponsorships_responsible_user_id_fkey(id, display_name, email)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!row) return null
  const sponsorship = row as unknown as SponsorshipDetail['sponsorship']

  const [summary, review, contacts, contributions, decisions, history, levels, deliverables] = await Promise.all([
    supabase.from('sponsorship_summary').select('*').eq('sponsorship_id', id).maybeSingle(),
    supabase.from('sponsorship_level_review').select('*').eq('sponsorship_id', id).maybeSingle(),
    supabase.from('sponsor_contacts').select('*').eq('sponsor_id', sponsorship.sponsor_id).order('is_primary', { ascending: false }).order('name'),
    supabase.from('sponsorship_contributions').select('*').eq('sponsorship_id', id).order('created_at', { ascending: true }),
    supabase
      .from('sponsorship_level_decisions')
      .select('*, level:sponsorship_levels(id, name), decider:profiles!sponsorship_level_decisions_decided_by_fkey(id, display_name, email)')
      .eq('sponsorship_id', id)
      .order('decided_at', { ascending: false }),
    supabase
      .from('sponsorship_history')
      .select('*, author:profiles!sponsorship_history_created_by_fkey(id, display_name, email)')
      .eq('sponsorship_id', id)
      .order('created_at', { ascending: false }),
    listSponsorshipLevels(supabase, sponsorship.season),
    listSponsorshipDeliverables(supabase, id),
  ])
  for (const r of [summary, review, contacts, contributions, decisions, history]) if (r.error) throw r.error
  if (!summary.data) return null

  const contributionRows = ((contributions.data ?? []) as SponsorshipContribution[]).map((c) => ({
    ...c,
    committed_amount: c.committed_amount == null ? null : toNumber(c.committed_amount),
    estimated_value: c.estimated_value == null ? null : toNumber(c.estimated_value),
  }))

  let payments: SponsorshipPayment[] = []
  if (contributionRows.length > 0) {
    const { data: paymentRows, error: paymentError } = await supabase
      .from('sponsorship_payments')
      .select('*, recorder:profiles!sponsorship_payments_recorded_by_fkey(id, display_name, email)')
      .in('contribution_id', contributionRows.map((c) => c.id))
      .order('received_on', { ascending: false })
      .order('recorded_at', { ascending: false })
    if (paymentError) throw paymentError
    payments = ((paymentRows ?? []) as unknown as SponsorshipPayment[]).map((p) => ({ ...p, amount: toNumber(p.amount) }))
  }

  return {
    sponsorship,
    summary: normalizeSummary(summary.data as SponsorshipSummary),
    review: review.data ? normalizeReview(review.data as SponsorshipLevelReview) : null,
    contacts: (contacts.data ?? []) as SponsorContact[],
    contributions: contributionRows,
    payments,
    decisions: ((decisions.data ?? []) as unknown as SponsorshipLevelDecision[]).map((d) => ({
      ...d,
      basis_cash: toNumber(d.basis_cash),
      basis_in_kind: toNumber(d.basis_in_kind),
      basis_total: toNumber(d.basis_total),
      threshold: d.threshold == null ? null : toNumber(d.threshold),
    })),
    deliverables,
    history: (history.data ?? []) as unknown as SponsorshipHistoryEntry[],
    levels,
  }
}

export interface SponsorHistory {
  sponsor: Sponsor
  contacts: SponsorContact[]
  seasons: {
    sponsorship: Pick<Sponsorship, 'id' | 'season' | 'stage' | 'agreement_url' | 'notes' | 'custom_terms' | 'renewal_date'>
    summary: SponsorshipSummary
    review: SponsorshipLevelReview | null
    contributions: SponsorshipContribution[]
  }[]
}

export async function getSponsorHistory(supabase: SupabaseClient, sponsorId: string): Promise<SponsorHistory | null> {
  const { data: sponsor, error } = await supabase.from('sponsors').select('*').eq('id', sponsorId).maybeSingle()
  if (error) throw error
  if (!sponsor) return null

  const { data: sponsorshipRows, error: sponsorshipError } = await supabase
    .from('sponsorships')
    .select('id, season, stage, agreement_url, notes, custom_terms, renewal_date')
    .eq('sponsor_id', sponsorId)
  if (sponsorshipError) throw sponsorshipError
  const rows = (sponsorshipRows ?? []) as SponsorHistory['seasons'][number]['sponsorship'][]

  const [contacts, summaries, reviews] = await Promise.all([
    supabase.from('sponsor_contacts').select('*').eq('sponsor_id', sponsorId).order('is_primary', { ascending: false }).order('name'),
    supabase.from('sponsorship_summary').select('*').eq('sponsor_id', sponsorId),
    rows.length > 0 ? supabase.from('sponsorship_level_review').select('*').in('sponsorship_id', rows.map((r) => r.id)) : Promise.resolve({ data: [], error: null }),
  ])
  for (const r of [contacts, summaries, reviews]) if (r.error) throw r.error
  let contributions: SponsorshipContribution[] = []
  if (rows.length > 0) {
    const { data: cRows, error: cError } = await supabase
      .from('sponsorship_contributions')
      .select('*')
      .in('sponsorship_id', rows.map((r) => r.id))
      .order('created_at', { ascending: true })
    if (cError) throw cError
    contributions = ((cRows ?? []) as SponsorshipContribution[]).map((c) => ({
      ...c,
      committed_amount: c.committed_amount == null ? null : toNumber(c.committed_amount),
      estimated_value: c.estimated_value == null ? null : toNumber(c.estimated_value),
    }))
  }

  const summaryById = new Map(((summaries.data ?? []) as SponsorshipSummary[]).map((s) => [s.sponsorship_id, normalizeSummary(s)]))
  const reviewById = new Map(((reviews.data ?? []) as SponsorshipLevelReview[]).map((r) => [r.sponsorship_id, normalizeReview(r)]))

  const seasons = rows
    .map((sponsorship) => ({
      sponsorship,
      summary: summaryById.get(sponsorship.id)!,
      review: reviewById.get(sponsorship.id) ?? null,
      contributions: contributions.filter((c) => c.sponsorship_id === sponsorship.id),
    }))
    .filter((s) => s.summary)
    .sort((a, b) => b.sponsorship.season.localeCompare(a.sponsorship.season))

  return { sponsor: sponsor as Sponsor, contacts: (contacts.data ?? []) as SponsorContact[], seasons }
}

// ---------------------------------------------------------
// Writes. Row Level Security and the 0034 triggers decide what is allowed; a blocked update or delete is a silent
// zero-row result, so those ask for the row back and report it.
// ---------------------------------------------------------
async function requireRow<T>(result: PromiseLike<{ data: T[] | null; error: unknown }>, message: string) {
  const { data, error } = await result
  if (error) throw error
  if (!data || data.length === 0) throw new Error(message)
}

const NO_PERMISSION = 'That change was not saved. You may not have permission.'

// Creates the four flyer levels + their deliverables for a season, or copies another season's program.
export async function createSponsorshipProgram(supabase: SupabaseClient, season: string, copyFrom?: string | null): Promise<number> {
  const { data, error } = await supabase.rpc('create_sponsorship_program', { p_season: season, p_copy_from: copyFrom ?? null })
  if (error) throw error
  return Number(data)
}

// The database reads the live contributions itself, so nothing about the basis is sent from here.
export async function setSponsorshipLevel(supabase: SupabaseClient, sponsorshipId: string, levelId: string | null, reason: string | null) {
  const { error } = await supabase.rpc('set_sponsorship_level', { p_sponsorship_id: sponsorshipId, p_level_id: levelId, p_reason: reason })
  if (error) throw error
}

export async function createSponsor(supabase: SupabaseClient, input: { name: string; sponsor_type: SponsorType; website?: string | null }): Promise<string> {
  const { data, error } = await supabase
    .from('sponsors')
    .insert({ name: input.name.trim(), sponsor_type: input.sponsor_type, website: input.website?.trim() || null })
    .select('id')
    .single()
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('A sponsor with that name already exists. Choose it from the list instead.')
    throw error
  }
  return (data as { id: string }).id
}

export async function updateSponsor(supabase: SupabaseClient, id: string, patch: Partial<Pick<Sponsor, 'name' | 'sponsor_type' | 'website' | 'notes' | 'active'>>) {
  const result = await supabase.from('sponsors').update(patch).eq('id', id).select('id')
  if (result.error && (result.error as { code?: string }).code === '23505') throw new Error('A sponsor with that name already exists.')
  await requireRow(Promise.resolve(result), NO_PERMISSION)
}

export async function createSponsorship(supabase: SupabaseClient, input: { sponsor_id: string; season: string; stage: SponsorshipStage }): Promise<string> {
  const { data, error } = await supabase.from('sponsorships').insert(input).select('id').single()
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('This sponsor already has a sponsorship in that season.')
    throw error
  }
  return (data as { id: string }).id
}

export async function updateSponsorship(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<Pick<Sponsorship, 'stage' | 'custom_terms' | 'responsible_user_id' | 'committed_on' | 'renewal_date' | 'agreement_url' | 'notes'>>
) {
  await requireRow(supabase.from('sponsorships').update(patch).eq('id', id).select('id'), NO_PERMISSION)
}

export async function addContribution(
  supabase: SupabaseClient,
  input: {
    sponsorship_id: string
    kind: ContributionKind
    description?: string | null
    committed_amount?: number | null
    estimated_value?: number | null
    in_kind_type?: InKindType | null
    contributed_on?: string | null
    contributed_on_precision?: DatePrecision
    received_on?: string | null
    notes?: string | null
  }
) {
  const { error } = await supabase.from('sponsorship_contributions').insert(input)
  if (error) throw error
}

export async function setContributionWithdrawn(supabase: SupabaseClient, id: string, withdrawn: boolean) {
  await requireRow(supabase.from('sponsorship_contributions').update({ withdrawn }).eq('id', id).select('id'), NO_PERMISSION)
}

export async function recordPayment(
  supabase: SupabaseClient,
  input: {
    contribution_id: string
    entry_type: PaymentEntryType
    amount: number
    received_on: string
    method: PaymentMethod
    reference?: string | null
    notes?: string | null
    received_by: PaymentReceivedBy
    availability: PaymentAvailability
    available_on?: string | null
  }
) {
  const { error } = await supabase.from('sponsorship_payments').insert(input)
  if (error) throw error
}

export async function markPaymentAvailable(supabase: SupabaseClient, paymentId: string, availableOn: string) {
  const { error } = await supabase.rpc('mark_payment_available', { p_payment_id: paymentId, p_available_on: availableOn })
  if (error) throw error
}

// ---- Deliverables (0035). The database decides who may change what; these only ask. ----

// A manager adds a custom deliverable (standard ones are created by the database when a level is set).
export async function addDeliverable(
  supabase: SupabaseClient,
  input: { sponsorship_id: string; title: string; assigned_to?: string | null; due_date?: string | null; notes?: string | null }
) {
  const { error } = await supabase.from('sponsorship_deliverables').insert({
    sponsorship_id: input.sponsorship_id,
    title: input.title.trim(),
    assigned_to: input.assigned_to || null,
    due_date: input.due_date || null,
    notes: input.notes?.trim() || null,
  })
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('This sponsorship already has a deliverable with that title.')
    throw error
  }
}

// Managers may change any of these; the assigned Business member may change ONLY status and notes (the database
// refuses anything else from them with a clear message).
export async function updateDeliverable(
  supabase: SupabaseClient,
  id: string,
  patch: { title?: string; status?: DeliverableStatus; assigned_to?: string | null; due_date?: string | null; notes?: string | null }
) {
  const { error, data } = await supabase.from('sponsorship_deliverables').update(patch).eq('id', id).select('id')
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('This sponsorship already has a deliverable with that title.')
    throw error
  }
  if (!data || data.length === 0) throw new Error(NO_PERMISSION)
}

export async function deleteDeliverable(supabase: SupabaseClient, id: string) {
  await requireRow(supabase.from('sponsorship_deliverables').delete().eq('id', id).select('id'), 'That deliverable was not removed. Completed deliverables can only be removed by an admin.')
}

export async function addSponsorshipNote(supabase: SupabaseClient, sponsorshipId: string, body: string) {
  const { error } = await supabase.from('sponsorship_history').insert({ sponsorship_id: sponsorshipId, kind: 'note', body: body.trim() })
  if (error) throw error
}

export async function addSponsorContact(
  supabase: SupabaseClient,
  input: { sponsor_id: string; name?: string | null; title?: string | null; email?: string | null; phone?: string | null; is_primary?: boolean }
) {
  const clean = (v?: string | null) => (v && v.trim() ? v.trim() : null)
  const { error } = await supabase.from('sponsor_contacts').insert({
    sponsor_id: input.sponsor_id,
    name: clean(input.name),
    title: clean(input.title),
    email: clean(input.email),
    phone: clean(input.phone),
    is_primary: input.is_primary ?? false,
  })
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('This sponsor already has a primary contact. Untick “primary” or remove the current one first.')
    if ((error as { code?: string }).code === '23514') throw new Error('A contact needs at least a name, an email or a phone number.')
    throw error
  }
}

export async function removeSponsorContact(supabase: SupabaseClient, id: string) {
  await requireRow(supabase.from('sponsor_contacts').delete().eq('id', id).select('id'), NO_PERMISSION)
}

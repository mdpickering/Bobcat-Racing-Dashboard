import type { Profile } from './user'

export type TaskStatus = 'To Do' | 'In Progress' | 'Blocked' | 'Review' | 'Complete'
export type TaskPriority = 'Critical' | 'High' | 'Medium' | 'Low'
export type TaskAssigneeRole = 'primary' | 'co_owner'
export type TaskRequestStatus = 'pending' | 'approved' | 'declined'
export type ApplicationStatus = 'pending' | 'approved' | 'rejected'

export interface MemberApplication {
  id: string
  legacy_id: string | null
  name: string
  email: string
  year: string | null
  experience_level: string | null
  weekly_hours: number | null
  skills: string[] | null
  goals: string | null
  status: ApplicationStatus
  linked_profile_id: string | null
  submitted_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  reviewer?: Pick<Profile, 'id' | 'display_name' | 'email'> | null
}

export interface Subsystem {
  id: string
  name: string
  description: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface SubsystemCategory {
  id: string
  subsystem_id: string
  name: string
  engineering_rule: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface SubsystemMember {
  subsystem_id: string
  user_id: string
  is_lead: boolean
  created_at: string
  profile?: Pick<Profile, 'id' | 'display_name' | 'email' | 'avatar_url' | 'role'>
  subsystem?: Pick<Subsystem, 'id' | 'name' | 'active'>
}

export interface Task {
  id: string
  title: string
  description: string | null
  subsystem_id: string
  category_id: string | null
  primary_owner_id: string | null
  priority: TaskPriority
  status: TaskStatus
  deadline: string | null
  created_by: string
  completed_at: string | null
  created_at: string
  updated_at: string
  legacy_id: string | null
  legacy_assignee_raw: string | null
  // joined convenience fields (populated by query layer, not real columns)
  subsystem?: Pick<Subsystem, 'id' | 'name'>
  category?: Pick<SubsystemCategory, 'id' | 'name'> | null
  primary_owner?: Pick<Profile, 'id' | 'display_name' | 'email' | 'avatar_url'> | null
  assignees?: TaskAssignee[]
}

export interface TaskAssignee {
  task_id: string
  user_id: string
  role: TaskAssigneeRole
  created_at: string
  profile?: Pick<Profile, 'id' | 'display_name' | 'email' | 'avatar_url'>
}

export interface TaskRequest {
  id: string
  requester_id: string
  legacy_requester_raw: string | null
  subsystem_id: string
  title: string
  description: string | null
  status: TaskRequestStatus
  created_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  converted_task_id: string | null
  requester?: Pick<Profile, 'id' | 'display_name' | 'email'>
  subsystem?: Pick<Subsystem, 'id' | 'name'>
}

export interface TaskComment {
  id: string
  task_id: string
  user_id: string
  comment: string
  created_at: string
  updated_at: string
  user?: Pick<Profile, 'id' | 'display_name' | 'email' | 'avatar_url'>
  mentions?: CommentMention[]
}

export interface CommentMention {
  comment_id: string
  mentioned_profile_id: string
  created_at: string
  profile?: Pick<Profile, 'id' | 'display_name' | 'email'>
}

export interface TaskAttachment {
  id: string
  task_id: string
  uploaded_by: string
  file_name: string
  storage_path: string
  file_size: number
  mime_type: string | null
  created_at: string
  uploader?: Pick<Profile, 'id' | 'display_name' | 'email'>
}

export type NotificationType =
  | 'task_assignment'
  | 'co_owner_assignment'
  | 'task_due_soon'
  | 'task_deadline_changed'
  | 'deadline'
  | 'overdue_task'
  | 'blocked_task'
  | 'review_request'
  | 'cad_review'
  | 'purchase_status'
  | 'comment_mention'
  | 'sponsorship_deliverable_assigned'
  | 'sponsorship_renewal'
  | 'subsystem_announcement'
  | 'account_approval'
  | 'account_rejection'
  | string

export interface AppNotification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  message: string | null
  entity_type: string | null
  entity_id: string | null
  read_at: string | null
  created_at: string
}

// One row of the email-preference catalog (migration 0029), plus the viewer's effective choice.
export interface EmailPreferenceCategory {
  key: string
  label: string
  description: string
  default_enabled: boolean
  enabled: boolean
}

// A member of the Business team (migration 0033). is_lead = Business Lead; responsibilities are extra Business
// duties such as 'sponsorship_lead'.
export interface BusinessMember {
  user_id: string
  is_lead: boolean
  added_by: string | null
  added_at: string
  profile?: Pick<Profile, 'id' | 'display_name' | 'email' | 'avatar_url' | 'role'> | null
  responsibilities?: { responsibility: string }[]
}

export type PurchaseStatus =
  | 'Draft'
  | 'Submitted'
  | 'Under Review'
  | 'Approved'
  | 'Ordered'
  | 'In Transit'
  | 'Arrived in Shop'
  | 'Completed'
  | 'Rejected'
  | 'Cancelled'

export interface PurchaseRequest {
  id: string
  subsystem_id: string
  requested_by: string
  title: string
  description: string | null
  vendor: string | null
  status: PurchaseStatus
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  legacy_id: string | null
  legacy_status_raw: string | null
  subsystem?: Pick<Subsystem, 'id' | 'name'>
  requester?: Pick<Profile, 'id' | 'display_name' | 'email'>
  reviewer?: Pick<Profile, 'id' | 'display_name' | 'email'> | null
  items?: PurchaseRequestItem[]
}

export interface PurchaseRequestItem {
  id: string
  purchase_request_id: string
  description: string
  quantity: number
  unit_cost: number | null
  link: string | null
  notes: string | null
  part_number: string | null
  subassembly: string | null
  // the store this item is bought from, and the member responsible for it (both optional; the
  // request's vendor and the requester are the fallbacks)
  vendor: string | null
  responsible_user_id: string | null
  responsible?: Pick<Profile, 'id' | 'display_name' | 'email'> | null
  // optional links to the parts / vendors catalog (migration 0037); the text fields above stay the snapshot
  part_id?: string | null
  vendor_id?: string | null
  created_at: string
  updated_at: string
  legacy_id: string | null
}

// ---------------------------------------------------------
// Parts and vendors (migration 0037)
// ---------------------------------------------------------
export interface Vendor {
  id: string
  name: string
  website: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string | null
  notes: string | null
  active: boolean
  created_at: string
  updated_at: string
}

// One row of the vendors_overview view.
export interface VendorOverview extends Vendor {
  part_count: number
  purchase_items: number
  purchase_total: number
  last_purchase_at: string | null
}

// One row of the parts_catalog view (the part plus its derived vendor / price figures).
export interface PartCatalogRow {
  id: string
  part_number: string
  name: string
  description: string | null
  subsystem_id: string
  subsystem_name: string
  category: string | null
  manufacturer: string | null
  manufacturer_part_number: string | null
  unit_cost: number | null
  source_url: string | null
  notes: string | null
  active: boolean
  created_at: string
  updated_at: string
  vendor_count: number
  preferred_vendor_id: string | null
  preferred_vendor_name: string | null
  preferred_vendor_cost: number | null
  preferred_vendor_part_number: string | null
  vendor_names: string
  effective_unit_cost: number | null
  has_vendor: boolean
  missing_cost: boolean
}

export interface PartVendorLink {
  part_id: string
  vendor_id: string
  vendor_part_number: string | null
  unit_cost: number | null
  product_url: string | null
  is_preferred: boolean
  availability_notes: string | null
  last_verified_on: string | null
  created_at: string
  updated_at: string
  vendor?: Pick<Vendor, 'id' | 'name' | 'website' | 'active'> | null
  part?: Pick<PartCatalogRow, 'id' | 'part_number' | 'name' | 'active' | 'subsystem_id'> | null
}

export interface PurchaseStatusHistory {
  id: string
  purchase_request_id: string
  from_status: PurchaseStatus | null
  to_status: PurchaseStatus
  changed_by: string
  changed_at: string
  note: string | null
  changed_by_profile?: Pick<Profile, 'id' | 'display_name' | 'email'>
}

export type CadReviewStatus = 'Draft' | 'Submitted for Review' | 'Changes Requested' | 'Approved' | 'Approved for Manufacturing'

export interface CadReview {
  id: string
  subsystem_id: string
  task_id: string | null
  title: string
  description: string | null
  submitted_by: string
  reviewer_id: string | null
  status: CadReviewStatus
  current_revision: number
  reviewed_at: string | null
  created_at: string
  updated_at: string
  legacy_id: string | null
  legacy_status_raw: string | null
  subsystem?: Pick<Subsystem, 'id' | 'name'>
  task?: Pick<Task, 'id' | 'title'> | null
  submitter?: Pick<Profile, 'id' | 'display_name' | 'email' | 'avatar_url'>
  reviewer?: Pick<Profile, 'id' | 'display_name' | 'email' | 'avatar_url'> | null
  versions?: CadReviewVersion[]
}

export interface CadReviewVersion {
  id: string
  cad_review_id: string
  revision_number: number
  submitted_by: string
  external_cad_link: string | null
  drawing_link: string | null
  notes: string | null
  created_at: string
  legacy_id: string | null
  submitter?: Pick<Profile, 'id' | 'display_name' | 'email'>
}

export interface CadReviewComment {
  id: string
  cad_review_id: string
  user_id: string
  comment: string
  created_at: string
  updated_at: string
  user?: Pick<Profile, 'id' | 'display_name' | 'email' | 'avatar_url'>
}

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  start_time: string
  end_time: string
  subsystem_id: string | null
  created_by: string
  active: boolean
  created_at: string
  updated_at: string
  subsystem?: Pick<Subsystem, 'id' | 'name'> | null
  creator?: Pick<Profile, 'id' | 'display_name' | 'email'>
}

export interface RecurringEvent {
  id: string
  title: string
  day_of_week: number
  time_label: string | null
  color: string | null
  subsystem_id: string | null
  active: boolean
  created_at: string
  updated_at: string
  subsystem?: Pick<Subsystem, 'id' | 'name'> | null
}

export interface Milestone {
  id: string
  name: string
  date: string
  subsystem_id: string | null
  description: string | null
  active: boolean
  created_at: string
  updated_at: string
  subsystem?: Pick<Subsystem, 'id' | 'name'> | null
}

export interface TimelineColumn {
  key: string
  label: string
  highlight: boolean
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
}

export interface TimelineMilestone {
  subsystem_id: string
  timeline_column_key: string
  milestone_text: string | null
  updated_by: string
  created_at: string
  updated_at: string
}

export interface AuditLogEntry {
  id: string
  user_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  created_at: string
  actor?: Pick<Profile, 'id' | 'display_name' | 'email'> | null
}

export type MigrationLogStatus = 'migrated' | 'exception' | 'skipped'

export interface MigrationLogEntry {
  id: string
  migration_batch_id: string
  entity_type: string
  legacy_id_or_key: string
  new_id: string | null
  match_method: string | null
  status: MigrationLogStatus
  notes: string | null
  created_at: string
}

export type MigrationExceptionResolutionStatus = 'unresolved' | 'resolved' | 'ignored'

export interface MigrationException {
  id: string
  migration_batch_id: string
  entity_type: string
  raw_value: string | null
  context: Record<string, unknown> | null
  resolution_status: MigrationExceptionResolutionStatus
  resolved_to_profile_id: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  resolvedToProfile?: Pick<Profile, 'id' | 'display_name' | 'email'> | null
}

export interface CompetitionSettings {
  season: string
  competition_name: string | null
  competition_date: string | null
  build_start: string | null
  design_freeze: string | null
  manufacturing_start: string | null
  testing_start: string | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------
// Sponsorships (migration 0034)
// ---------------------------------------------------------
export type SponsorType = 'company' | 'foundation' | 'family_or_individual' | 'other'
export type SponsorshipStage = 'prospect' | 'contacted' | 'interested' | 'committed' | 'declined' | 'withdrawn'
export type ContributionKind = 'cash' | 'in_kind'
export type InKindType = 'discount' | 'components_products' | 'tool' | 'software' | 'service' | 'other'
export type DatePrecision = 'day' | 'month'
export type PaymentEntryType = 'payment' | 'refund'
export type PaymentMethod = 'check' | 'cash' | 'card' | 'wire_ach' | 'university_giving' | 'other' | 'unknown'
export type PaymentReceivedBy = 'university' | 'team' | 'unknown'
export type PaymentAvailability = 'held_by_university' | 'available' | 'unknown'
export type LevelDecisionMethod = 'qualified' | 'exception' | 'custom' | 'historical_unassigned'
export type LevelReviewFlag =
  | 'none_recorded'
  | 'historical_unassigned'
  | 'custom'
  | 'exception_recorded'
  | 'below_minimum'
  | 'qualifies_higher'
  | 'ok'

export interface Sponsor {
  id: string
  name: string
  sponsor_type: SponsorType
  website: string | null
  notes: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface SponsorContact {
  id: string
  sponsor_id: string
  name: string | null
  title: string | null
  email: string | null
  phone: string | null
  is_primary: boolean
  notes: string | null
  active: boolean
}

export interface SponsorshipLevelDeliverable {
  id: string
  level_id: string
  title: string
  sort_order: number
}

export interface SponsorshipLevel {
  id: string
  season: string
  level_key: string
  name: string
  min_amount: number
  sort_order: number
  active: boolean
  deliverables?: SponsorshipLevelDeliverable[]
}

export interface Sponsorship {
  id: string
  sponsor_id: string
  season: string
  stage: SponsorshipStage
  level_id: string | null
  level_decision_id: string | null
  custom_terms: string | null
  responsible_user_id: string | null
  committed_on: string | null
  renewal_date: string | null
  agreement_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// One row of the sponsorship_summary view (all figures are derived in the database).
export interface SponsorshipSummary {
  sponsorship_id: string
  sponsor_id: string
  sponsor_name: string
  season: string
  stage: SponsorshipStage
  level_id: string | null
  level_name: string | null
  cash_committed: number
  cash_received: number
  cash_outstanding: number
  cash_over_received: number
  cash_available: number
  cash_held_by_university: number
  cash_availability_unknown: number
  cash_refunded: number
  in_kind_value: number
  in_kind_received_value: number
  total_sponsorship_value: number
}

// One row of the sponsorship_level_review view. It only flags; it never changes a level.
export interface SponsorshipLevelReview {
  sponsorship_id: string
  season: string
  qualifying_value: number
  recorded_level_id: string | null
  recorded_level_name: string | null
  decision_method: LevelDecisionMethod | null
  decision_basis_total: number | null
  suggested_level_id: string | null
  suggested_level_name: string | null
  review_flag: LevelReviewFlag
}

export interface SponsorshipContribution {
  id: string
  sponsorship_id: string
  kind: ContributionKind
  description: string | null
  committed_amount: number | null
  estimated_value: number | null
  in_kind_type: InKindType | null
  contributed_on: string | null
  contributed_on_precision: DatePrecision
  received_on: string | null
  received_on_precision: DatePrecision
  withdrawn: boolean
  notes: string | null
  created_at: string
}

export interface SponsorshipPayment {
  id: string
  contribution_id: string
  entry_type: PaymentEntryType
  amount: number
  received_on: string
  received_on_precision: DatePrecision
  method: PaymentMethod
  reference: string | null
  notes: string | null
  received_by: PaymentReceivedBy
  availability: PaymentAvailability
  available_on: string | null
  recorded_at: string
  recorder?: Pick<Profile, 'id' | 'display_name' | 'email'> | null
}

export interface SponsorshipLevelDecision {
  id: string
  sponsorship_id: string
  level_id: string | null
  method: LevelDecisionMethod
  basis_cash: number
  basis_in_kind: number
  basis_total: number
  threshold: number | null
  reason: string | null
  decided_at: string
  level?: Pick<SponsorshipLevel, 'id' | 'name'> | null
  decider?: Pick<Profile, 'id' | 'display_name' | 'email'> | null
}

export interface SponsorshipHistoryEntry {
  id: string
  sponsorship_id: string
  kind: 'note' | 'stage_change' | 'level_decision' | 'contribution' | 'payment' | 'availability' | 'deliverable' | 'renewal'
  body: string | null
  created_at: string
  author?: Pick<Profile, 'id' | 'display_name' | 'email'> | null
}

// ---------------------------------------------------------
// Inventory + Receiving (migration 0038)
// ---------------------------------------------------------
export type InventoryTransactionKind = 'opening_balance' | 'receipt' | 'receipt_reversal' | 'adjustment' | 'write_off' | 'transfer_out' | 'transfer_in'

export interface InventoryLocation {
  id: string
  name: string
  description: string | null
  active: boolean
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface InventoryStock {
  part_id: string
  location_id: string
  quantity_on_hand: number
  updated_at: string
}

export interface InventoryTransaction {
  id: string
  part_id: string
  location_id: string
  quantity_delta: number
  kind: InventoryTransactionKind
  reason: string | null
  notes: string | null
  receipt_line_id: string | null
  transfer_group_id: string | null
  created_by: string
  created_at: string
  part?: Pick<PartCatalogRow, 'id' | 'part_number' | 'name'> | null
  location?: Pick<InventoryLocation, 'id' | 'name'> | null
  actor?: Pick<Profile, 'id' | 'display_name' | 'email'> | null
}

export interface PurchaseReceipt {
  id: string
  purchase_request_id: string
  received_by: string
  received_on: string
  notes: string | null
  client_token: string
  created_at: string
}

export interface PurchaseReceiptLine {
  id: string
  receipt_id: string
  purchase_request_item_id: string
  quantity_received: number
  quantity_rejected: number
  rejected_reason: string | null
  part_id: string | null
  location_id: string | null
  reverses_line_id: string | null
  reason: string | null
  notes: string | null
  created_at: string
}

// One row of the purchase_receiving_status view: one purchase line, with what has been accepted/rejected against it.
export interface PurchaseReceivingStatusRow {
  item_id: string
  purchase_request_id: string
  subsystem_id: string
  request_title: string
  request_status: PurchaseStatus
  description: string
  part_number: string | null
  vendor: string | null
  part_id: string | null
  vendor_id: string | null
  ordered_quantity: number
  accepted_quantity: number
  rejected_quantity: number
  outstanding_quantity: number
  fully_received: boolean
  last_received_on: string | null
  receivable: boolean
}

// One row of the purchase_request_receiving view: the whole request's receiving summary.
export interface PurchaseRequestReceivingRow {
  purchase_request_id: string
  line_count: number
  ordered_total: number
  accepted_total: number
  rejected_total: number
  outstanding_total: number
  lines_fully_received: number
  all_received: boolean
  last_received_on: string | null
}

// One row of the inventory_overview view: one part's stock picture, real subsystems onward.
export interface InventoryOverviewRow {
  part_id: string
  part_number: string
  name: string
  subsystem_id: string
  subsystem_name: string
  category: string | null
  active: boolean
  effective_unit_cost: number | null
  missing_cost: boolean
  on_hand: number
  location_count: number
  location_names: string
  on_order: number
  last_received_on: string | null
  stock_value: number | null
}

// One row of the inventory_by_location view: one part, one location.
export interface InventoryByLocationRow {
  part_id: string
  part_number: string
  part_name: string
  subsystem_id: string
  part_active: boolean
  location_id: string
  location_name: string
  location_active: boolean
  quantity_on_hand: number
  updated_at: string
}

// Sponsorship renewals (migration 0036)
export type RenewalState = 'not_applicable' | 'no_date' | 'scheduled' | 'approaching' | 'overdue' | 'renewed'

// One row of the sponsorship_renewal_status view (derived in the database; not a pipeline stage).
export interface SponsorshipRenewalStatus {
  sponsorship_id: string
  sponsor_id: string
  season: string
  stage: SponsorshipStage
  renewal_date: string | null
  days_remaining: number | null
  renewed: boolean
  renewal_state: RenewalState
  reminder_recipients: number | null
}

// One reminder that was sent for one renewal date (the ledger that makes each threshold fire once).
export interface SponsorshipRenewalReminder {
  sponsorship_id: string
  renewal_date: string
  threshold_days: 60 | 30 | 7
  days_remaining: number
  created_at: string
}

// Sponsorship deliverables (migration 0035)
export type DeliverableStatus = 'not_started' | 'in_progress' | 'complete'
export type DeliverableSource = 'standard' | 'custom'

export interface SponsorshipDeliverable {
  id: string
  sponsorship_id: string
  title: string
  status: DeliverableStatus
  assigned_to: string | null
  due_date: string | null
  completed_at: string | null
  completed_by: string | null
  notes: string | null
  template_id: string | null
  source: DeliverableSource
  sort_order: number
  created_at: string
  updated_at: string
  assignee?: Pick<Profile, 'id' | 'display_name' | 'email'> | null
  completer?: Pick<Profile, 'id' | 'display_name' | 'email'> | null
}

// One row of the sponsorship_deliverable_progress view. A sponsorship with no deliverables has NO row (never 0 / 0).
export interface SponsorshipDeliverableProgress {
  sponsorship_id: string
  total: number
  completed: number
  in_progress: number
}

// Technical Meeting Agenda + COO Notes (migration 0041)
export type MeetingStatus = 'planned' | 'in_progress' | 'completed'
export type MeetingAgendaItemStatus = 'open' | 'discussed' | 'deferred'
export type MeetingActionItemStatus = 'open' | 'complete' | 'cancelled'
// A suggestion's real source table; 'manual' agenda items (and any dismissal, which only ever
// applies to a real suggestion) never use 'manual'.
export type MeetingAgendaSourceType = 'manual' | 'task' | 'milestone' | 'task_request' | 'purchasing' | 'cad' | 'previous_action'

export interface TechnicalMeeting {
  id: string
  title: string
  meeting_date: string
  start_time: string | null
  status: MeetingStatus
  started_at: string | null
  ended_at: string | null
  created_by: string
  summary_notes: string | null
  created_at: string
  updated_at: string
  creator?: Pick<Profile, 'id' | 'display_name' | 'email'> | null
}

export interface TechnicalMeetingAgendaItem {
  id: string
  meeting_id: string
  title: string
  source_type: MeetingAgendaSourceType
  source_id: string | null
  sort_order: number
  status: MeetingAgendaItemStatus
  discussion_notes: string | null
  decision: string | null
  created_at: string
  updated_at: string
}

export interface TechnicalMeetingActionItem {
  id: string
  meeting_id: string
  agenda_item_id: string | null
  title: string
  description: string | null
  assigned_to: string | null
  due_date: string | null
  subsystem_id: string | null
  linked_task_id: string | null
  status: MeetingActionItemStatus
  created_by: string
  created_at: string
  completed_at: string | null
  assignee?: Pick<Profile, 'id' | 'display_name' | 'email' | 'avatar_url'> | null
  subsystem?: { id: string; name: string } | null
  linked_task?: Pick<Task, 'id' | 'title' | 'status'> | null
}

export interface TechnicalMeetingSuggestionDismissal {
  id: string
  meeting_id: string
  source_type: MeetingAgendaSourceType
  source_id: string
  dismissed_by: string
  dismissed_at: string
}

// A candidate topic the agenda-suggestion engine surfaces, built from a real row in another table
// (never persisted itself — only an agenda item or a dismissal row is, once acted on).
export interface SuggestedMeetingTopic {
  sourceType: Exclude<MeetingAgendaSourceType, 'manual'>
  sourceId: string
  title: string
  detail: string | null
  category: 'overdue' | 'due_soon' | 'no_deadline' | 'blocked' | 'milestone' | 'task_request' | 'purchasing' | 'cad' | 'previous_action'
}

import type { Profile } from './user'

export type TaskStatus = 'To Do' | 'In Progress' | 'Blocked' | 'Review' | 'Complete'
export type TaskPriority = 'Critical' | 'High' | 'Medium' | 'Low'
export type TaskAssigneeRole = 'primary' | 'co_owner'
export type TaskRequestStatus = 'pending' | 'approved' | 'declined'

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
  | 'deadline'
  | 'overdue_task'
  | 'blocked_task'
  | 'review_request'
  | 'cad_review'
  | 'purchase_status'
  | 'comment_mention'
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

import Badge from '@/components/ui/Badge'
import type { TaskPriority, TaskStatus } from '@/types/database'

const STATUS_TONE: Record<TaskStatus, Parameters<typeof Badge>[0]['tone']> = {
  'To Do': 'slate',
  'In Progress': 'sky',
  Blocked: 'rose',
  Review: 'amber',
  Complete: 'emerald',
}

const PRIORITY_TONE: Record<TaskPriority, Parameters<typeof Badge>[0]['tone']> = {
  Critical: 'rose',
  High: 'amber',
  Medium: 'sky',
  Low: 'slate',
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{status}</Badge>
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <Badge tone={PRIORITY_TONE[priority]}>{priority}</Badge>
}

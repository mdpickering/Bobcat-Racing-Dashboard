import UiStatusBadge from '@/components/ui/StatusBadge'
import type { TaskPriority, TaskStatus } from '@/types/database'

// Tones come from the shared status registry (lib/status.ts) so a task status means the same colour as it does
// everywhere else in the application.
export function StatusBadge({ status }: { status: TaskStatus }) {
  return <UiStatusBadge domain="task" value={status} />
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <UiStatusBadge domain="priority" value={priority} />
}
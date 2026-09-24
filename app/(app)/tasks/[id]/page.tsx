import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTaskById, listTaskComments, listTaskAttachments } from '@/lib/supabase/queries/tasks'
import { listSubsystemMembers, listSubsystemCategories } from '@/lib/supabase/queries/subsystems'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'
import TaskDetailHeader from '@/components/tasks/TaskDetailHeader'
import TaskAssigneesPanel from '@/components/tasks/TaskAssigneesPanel'
import TaskCommentsPanel from '@/components/tasks/TaskCommentsPanel'
import TaskAttachmentsPanel from '@/components/tasks/TaskAttachmentsPanel'
import ErrorState from '@/components/ui/ErrorState'

export default async function TaskDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  const profile = profileRow as Profile

  let task
  try {
    task = await getTaskById(supabase, params.id)
  } catch {
    return <ErrorState message="Could not load this task." />
  }
  if (!task) notFound()

  const [comments, attachments, subsystemMembers, categories] = await Promise.all([
    listTaskComments(supabase, task.id).catch(() => []),
    listTaskAttachments(supabase, task.id).catch(() => []),
    listSubsystemMembers(supabase, task.subsystem_id).catch(() => []),
    listSubsystemCategories(supabase, task.subsystem_id).catch(() => []),
  ])

  const isLeadHere = subsystemMembers.some((m) => m.user_id === profile.id && m.is_lead)
  const canManage = isCtoOrAdmin(profile) || isLeadHere
  const isAssignee = task.assignees?.some((a) => a.user_id === profile.id) ?? false

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <TaskDetailHeader
        task={task}
        categories={categories}
        canManage={canManage}
        canChangeStatus={isAssignee}
        canDelete={canManage}
        attachmentPaths={attachments.map((a) => a.storage_path)}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-1">
          <TaskAssigneesPanel taskId={task.id} assignees={task.assignees ?? []} subsystemMembers={subsystemMembers} canManage={canManage} />
        </div>
        <div className="space-y-4 md:col-span-2">
          <TaskCommentsPanel taskId={task.id} comments={comments} subsystemMembers={subsystemMembers} currentUserId={profile.id} canModerate={isCtoOrAdmin(profile)} />
          <TaskAttachmentsPanel taskId={task.id} attachments={attachments} />
        </div>
      </div>
    </div>
  )
}

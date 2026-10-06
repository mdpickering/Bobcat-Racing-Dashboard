'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ExternalLink, Pencil, Check, X as XIcon, Send, MessageSquare } from 'lucide-react'
import Drawer from '@/components/ui/Drawer'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import Input from '@/components/ui/Input'
import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import InlineDateEditor from '@/components/ui/InlineDateEditor'
import { StatusBadge, PriorityBadge } from '@/components/tasks/TaskBadges'
import { createClient } from '@/lib/supabase/client'
import { updateTask, listTaskComments, addTaskComment } from '@/lib/supabase/queries/tasks'
import { getErrorMessage } from '@/lib/errors'
import { useToast } from '@/components/ui/Toast'
import { timeAgo } from '@/lib/format'
import type { Task, TaskComment, TaskStatus, TaskPriority } from '@/types/database'

const STATUSES: TaskStatus[] = ['To Do', 'In Progress', 'Blocked', 'Review', 'Complete']
const PRIORITIES: TaskPriority[] = ['Critical', 'High', 'Medium', 'Low']

interface TaskPreviewDrawerProps {
  task: Task | null
  open: boolean
  onClose: () => void
  currentUserId: string
  // cto/admin, or the lead of this task's own subsystem (tasks RLS is the real gate) -- gates
  // title/description/priority editing, matching the full task page's own canManage rule.
  canManage: boolean
  // COO/CTO/admin: may change the due date of any task (saved via reschedule_task()), even without canManage.
  canReschedule?: boolean
}

// "Simple inspection/edit -> drawer; complex task management -> full page" (assignee changes,
// mentions, editing others' comments, attachments, delete) stays on /tasks/<id>, one click away via
// the header link. Closing this never navigates -- whatever list opened it is untouched.
export default function TaskPreviewDrawer({ task, open, onClose, currentUserId, canManage, canReschedule = false }: TaskPreviewDrawerProps) {
  const router = useRouter()
  const toast = useToast()
  const [editingDetails, setEditingDetails] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [comments, setComments] = useState<TaskComment[] | null>(null)
  const [commentText, setCommentText] = useState('')
  const [postingComment, setPostingComment] = useState(false)

  const taskId = task?.id ?? null

  useEffect(() => {
    if (!open || !taskId) return
    setEditingDetails(false)
    setComments(null)
    listTaskComments(createClient(), taskId)
      .then(setComments)
      .catch(() => setComments([]))
  }, [open, taskId])

  if (!task) return null

  const isAssignee = task.assignees?.some((a) => a.user_id === currentUserId) ?? false
  const canEditStatus = canManage || isAssignee

  async function persist(patch: Record<string, unknown>) {
    if (!task) return
    setSaving(true)
    try {
      await updateTask(createClient(), task.id, patch)
      router.refresh()
    } catch (err) {
      toast.push(getErrorMessage(err, 'Could not save that change.'), 'danger')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveDetails() {
    await persist({ title: title.trim() || task!.title, description: description.trim() || null })
    setEditingDetails(false)
  }

  async function handlePostComment() {
    if (!commentText.trim() || !task) return
    setPostingComment(true)
    try {
      await addTaskComment(createClient(), task.id, commentText.trim())
      setCommentText('')
      const fresh = await listTaskComments(createClient(), task.id)
      setComments(fresh)
    } catch (err) {
      toast.push(getErrorMessage(err, 'Could not post that comment.'), 'danger')
    } finally {
      setPostingComment(false)
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Task preview"
      headerActions={
        <Link
          href={`/tasks/${task.id}`}
          title="Open full task page"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary hover:bg-surface hover:text-text-primary"
        >
          <ExternalLink size={16} />
        </Link>
      }
    >
      <div className="space-y-4 text-xs">
        {editingDetails ? (
          <div className="space-y-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-sm font-bold" autoFocus />
            <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
            <div className="flex gap-2">
              <Button size="sm" disabled={saving} onClick={handleSaveDetails}>
                <Check size={12} /> Save
              </Button>
              <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditingDetails(false)}>
                <XIcon size={12} /> Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-bold text-text-primary">{task.title}</h3>
              {canManage && (
                <button
                  type="button"
                  onClick={() => {
                    setTitle(task.title)
                    setDescription(task.description ?? '')
                    setEditingDetails(true)
                  }}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center text-text-muted hover:text-accent-blue"
                >
                  <Pencil size={13} />
                </button>
              )}
            </div>
            {task.description && <p className="mt-1.5 whitespace-pre-wrap text-xs text-text-secondary">{task.description}</p>}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="slate">{task.subsystem?.name ?? 'Unknown subsystem'}</Badge>
          {task.category?.name && <Badge tone="slate">{task.category.name}</Badge>}
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
          <div>
            <p className="mb-1 text-[11px] font-semibold text-text-secondary">Status</p>
            {canEditStatus ? (
              <Select value={task.status} disabled={saving} onChange={(e) => persist({ status: e.target.value })} className="w-full">
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            ) : (
              <StatusBadge status={task.status} />
            )}
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold text-text-secondary">Priority</p>
            {canManage ? (
              <Select value={task.priority} disabled={saving} onChange={(e) => persist({ priority: e.target.value })} className="w-full">
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            ) : (
              <PriorityBadge priority={task.priority} />
            )}
          </div>
        </div>

        <div>
          <p className="mb-1 text-[11px] font-semibold text-text-secondary">Due date</p>
          {canManage || canReschedule ? <InlineDateEditor taskId={task.id} deadline={task.deadline} status={task.status} viaReschedule={canReschedule} /> : <p className="text-text-secondary">{task.deadline ? new Date(task.deadline).toLocaleDateString() : 'No deadline'}</p>}
        </div>

        <div className="border-t border-border pt-3">
          <p className="mb-2 text-[11px] font-semibold text-text-secondary">Owners</p>
          {task.assignees && task.assignees.length > 0 ? (
            <div className="space-y-1.5">
              {task.assignees.map((a) => (
                <div key={a.user_id} className="flex items-center gap-2">
                  <Avatar name={a.profile?.display_name || a.profile?.email} src={a.profile?.avatar_url} size={22} />
                  <span className="text-text-secondary">{a.profile?.display_name || a.profile?.email}</span>
                  {a.role === 'primary' && <span className="text-[10px] uppercase tracking-wide text-qu-gold">Primary</span>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-text-muted">Unassigned</p>
          )}
          {canManage && (
            <Link href={`/tasks/${task.id}`} className="mt-1.5 inline-block text-[11px] text-accent-blue hover:underline">
              Manage owners on the full page →
            </Link>
          )}
        </div>

        <div className="border-t border-border pt-3">
          <p className="mb-2 text-[11px] font-semibold text-text-secondary">Activity</p>
          {comments === null ? (
            <p className="text-text-muted">Loading…</p>
          ) : comments.length === 0 ? (
            <EmptyState icon={MessageSquare} title="No comments yet" />
          ) : (
            <ul className="mb-3 space-y-2.5">
              {comments.map((c) => (
                <li key={c.id} className="flex gap-2">
                  <Avatar name={c.user?.display_name || c.user?.email} src={c.user?.avatar_url} size={22} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-text-primary">{c.user?.display_name || c.user?.email}</span>
                      <span className="text-[10px] text-text-muted">{timeAgo(c.created_at)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-text-secondary">{c.comment}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Textarea rows={2} value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Add a quick comment…" />
          <div className="mt-1.5 flex items-center justify-between">
            <Link href={`/tasks/${task.id}`} className="text-[11px] text-accent-blue hover:underline">
              Full activity, mentions & attachments →
            </Link>
            <Button size="sm" disabled={postingComment || !commentText.trim()} onClick={handlePostComment}>
              <Send size={11} /> Post
            </Button>
          </div>
        </div>
      </div>
    </Drawer>
  )
}

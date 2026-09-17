'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AtSign, Send, Pencil } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Avatar from '@/components/ui/Avatar'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { createClient } from '@/lib/supabase/client'
import { addTaskComment, updateTaskComment } from '@/lib/supabase/queries/tasks'
import { timeAgo } from '@/lib/format'
import type { TaskComment, SubsystemMember } from '@/types/database'
import { MessageSquare } from 'lucide-react'

interface TaskCommentsPanelProps {
  taskId: string
  comments: TaskComment[]
  subsystemMembers: SubsystemMember[]
  currentUserId: string
  canModerate: boolean
}

export default function TaskCommentsPanel({ taskId, comments, subsystemMembers, currentUserId, canModerate }: TaskCommentsPanelProps) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [mentionIds, setMentionIds] = useState<string[]>([])
  const [showMentionPicker, setShowMentionPicker] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  function toggleMention(userId: string) {
    setMentionIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const supabase = createClient()
      await addTaskComment(supabase, taskId, text.trim(), mentionIds)
      setText('')
      setMentionIds([])
      setShowMentionPicker(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post comment.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSaveEdit(commentId: string) {
    try {
      const supabase = createClient()
      await updateTaskComment(supabase, commentId, editText)
      setEditingId(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save edit.')
    }
  }

  return (
    <Panel className="p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-text-primary">Activity</h3>

      {comments.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No comments yet" description="Start the conversation on this task." />
      ) : (
        <ul className="mb-4 space-y-3">
          {comments.map((c) => {
            const canEdit = c.user_id === currentUserId || canModerate
            return (
              <li key={c.id} className="flex gap-2.5">
                <Avatar name={c.user?.display_name || c.user?.email} src={c.user?.avatar_url} size={26} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-text-primary">{c.user?.display_name || c.user?.email}</span>
                    <span className="text-[10px] text-text-muted">{timeAgo(c.created_at)}</span>
                    {c.updated_at !== c.created_at && <span className="text-[10px] text-text-muted">(edited)</span>}
                  </div>
                  {editingId === c.id ? (
                    <div className="mt-1 space-y-1.5">
                      <Textarea rows={2} value={editText} onChange={(e) => setEditText(e.target.value)} />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleSaveEdit(c.id)}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-0.5 whitespace-pre-wrap text-xs text-text-secondary">{c.comment}</p>
                  )}
                  {c.mentions && c.mentions.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.mentions.map((m) => (
                        <span key={m.mentioned_profile_id} className="rounded-full bg-accent-blue/10 px-2 py-0.5 text-[10px] text-accent-blue">
                          @{m.profile?.display_name || m.profile?.email}
                        </span>
                      ))}
                    </div>
                  )}
                  {canEdit && editingId !== c.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(c.id)
                        setEditText(c.comment)
                      }}
                      className="mt-1 flex items-center gap-1 text-[10px] text-text-muted hover:text-accent-blue"
                    >
                      <Pencil size={10} /> Edit
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="space-y-2 border-t border-border pt-3">
        <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…" />
        {showMentionPicker && (
          <div className="flex flex-wrap gap-1.5 rounded-lg border border-border bg-bg p-2">
            {subsystemMembers.map((m) => (
              <button
                type="button"
                key={m.user_id}
                onClick={() => toggleMention(m.user_id)}
                className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                  mentionIds.includes(m.user_id) ? 'border-accent-blue bg-accent-blue/15 text-accent-blue' : 'border-border text-text-secondary hover:border-accent-blue/40'
                }`}
              >
                {m.profile?.display_name || m.profile?.email}
              </button>
            ))}
          </div>
        )}
        {error && <p className="text-[11px] text-rose-400">{error}</p>}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowMentionPicker((v) => !v)}
            className="flex items-center gap-1 text-[10px] font-mono uppercase text-text-muted hover:text-accent-blue"
          >
            <AtSign size={12} /> Mention{mentionIds.length > 0 ? ` (${mentionIds.length})` : ''}
          </button>
          <Button size="sm" type="submit" disabled={submitting || !text.trim()}>
            <Send size={12} /> Post
          </Button>
        </div>
      </form>
    </Panel>
  )
}

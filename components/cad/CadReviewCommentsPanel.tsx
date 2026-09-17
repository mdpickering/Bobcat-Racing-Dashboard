'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Pencil, MessageSquare } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Avatar from '@/components/ui/Avatar'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { createClient } from '@/lib/supabase/client'
import { addCadReviewComment, updateCadReviewComment } from '@/lib/supabase/queries/cad'
import { timeAgo } from '@/lib/format'
import type { CadReviewComment } from '@/types/database'

interface CadReviewCommentsPanelProps {
  cadReviewId: string
  comments: CadReviewComment[]
  currentUserId: string
  canModerate: boolean
}

export default function CadReviewCommentsPanel({ cadReviewId, comments, currentUserId, canModerate }: CadReviewCommentsPanelProps) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const supabase = createClient()
      await addCadReviewComment(supabase, cadReviewId, text.trim())
      setText('')
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
      await updateCadReviewComment(supabase, commentId, editText)
      setEditingId(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save edit.')
    }
  }

  return (
    <Panel className="p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-text-primary">Review Comments</h3>

      {comments.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No comments yet" description="Start the review discussion." />
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
        <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a review comment…" />
        {error && <p className="text-[11px] text-rose-400">{error}</p>}
        <div className="flex justify-end">
          <Button size="sm" type="submit" disabled={submitting || !text.trim()}>
            <Send size={12} /> Post
          </Button>
        </div>
      </form>
    </Panel>
  )
}

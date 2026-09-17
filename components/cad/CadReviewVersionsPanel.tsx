'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ExternalLink, FileText } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { createClient } from '@/lib/supabase/client'
import { addCadReviewVersion } from '@/lib/supabase/queries/cad'
import { formatDateTime } from '@/lib/format'
import type { CadReviewVersion } from '@/types/database'

interface CadReviewVersionsPanelProps {
  cadReviewId: string
  versions: CadReviewVersion[]
  canAddVersion: boolean
}

export default function CadReviewVersionsPanel({ cadReviewId, versions, canAddVersion }: CadReviewVersionsPanelProps) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [cadLink, setCadLink] = useState('')
  const [drawingLink, setDrawingLink] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const supabase = createClient()
      await addCadReviewVersion(supabase, {
        cad_review_id: cadReviewId,
        external_cad_link: cadLink || null,
        drawing_link: drawingLink || null,
        notes: notes || null,
      })
      setCadLink('')
      setDrawingLink('')
      setNotes('')
      setAdding(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add revision.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wide text-text-primary">Revision History</h3>
        {canAddVersion && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="text-[10px] font-mono uppercase text-accent-blue hover:underline">
            <Plus size={11} className="mr-0.5 inline" /> New revision
          </button>
        )}
      </div>

      {error && <p className="mb-2 text-[11px] text-rose-400">{error}</p>}

      {canAddVersion && adding && (
        <form onSubmit={handleAdd} className="mb-3 space-y-2 rounded-lg border border-border p-3 text-xs">
          <Input value={cadLink} onChange={(e) => setCadLink(e.target.value)} placeholder="External CAD link" />
          <Input value={drawingLink} onChange={(e) => setDrawingLink(e.target.value)} placeholder="Drawing link" />
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Revision notes" />
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={submitting}>
              Add Revision
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {versions.length === 0 ? (
        <EmptyState icon={FileText} title="No revisions yet" description="Add a CAD link, drawing link, and notes for revision 1." />
      ) : (
        <ul className="space-y-2.5">
          {versions.map((v) => (
            <li key={v.id} className="rounded-lg border border-border p-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text-primary">Rev {v.revision_number}</span>
                <span className="text-[10px] text-text-muted">
                  {v.submitter?.display_name || v.submitter?.email} · {formatDateTime(v.created_at)}
                </span>
              </div>
              {v.notes && <p className="mt-1 whitespace-pre-wrap text-text-secondary">{v.notes}</p>}
              <div className="mt-1.5 flex flex-wrap gap-3 text-[10px]">
                {v.external_cad_link && (
                  <a href={v.external_cad_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-accent-blue hover:underline">
                    <ExternalLink size={10} /> CAD file
                  </a>
                )}
                {v.drawing_link && (
                  <a href={v.drawing_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-accent-blue hover:underline">
                    <ExternalLink size={10} /> Drawing
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

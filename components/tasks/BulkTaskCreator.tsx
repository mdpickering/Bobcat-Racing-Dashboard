'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, ClipboardList, Copy, Plus } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Panel from '@/components/ui/Panel'
import Textarea from '@/components/ui/Textarea'
import { createClient } from '@/lib/supabase/client'
import { createTask } from '@/lib/supabase/queries/tasks'
import { setTaskSize } from '@/lib/supabase/queries/pickup'
import { getErrorMessage } from '@/lib/errors'
import { parseBulkTasks, summarizeBulk, type BulkCategory, type BulkRow, type BulkSubsystem } from '@/lib/bulkTasks'
import { SIZE_LABEL } from '@/lib/pickup'

interface BulkTaskCreatorProps {
  subsystems: BulkSubsystem[]
  categories: BulkCategory[]
  allowedSubsystemIds: string[]
  // titleKey()s of tasks that already exist
  existingKeys: string[]
  checklistText: string
}

interface Outcome {
  created: number
  boardFailed: string[]
  failed: { title: string; message: string }[]
}

// Paste one task per line (Subsystem | Category | Title | size | Description), check the preview, press Create. Each task is
// created with the ordinary task insert, so the usual rules apply (cto/admin, or a subsystem's lead), and a size puts it on
// the pick-up board. Everything created is a normal task: edit its title, description, category, priority, due date, size or
// owner afterwards on its own page. Titles that already exist are skipped, so pressing Create twice cannot double up.
export default function BulkTaskCreator({ subsystems, categories, allowedSubsystemIds, existingKeys, checklistText }: BulkTaskCreatorProps) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const rows = useMemo(
    () => parseBulkTasks(text, { subsystems, categories, allowedSubsystemIds: new Set(allowedSubsystemIds), existing: new Set(existingKeys) }),
    [text, subsystems, categories, allowedSubsystemIds, existingKeys]
  )
  const counts = summarizeBulk(rows)
  const toCreate = rows.filter((r): r is BulkRow & { subsystemId: string } => r.status === 'ok' && r.subsystemId !== null)

  async function create() {
    if (toCreate.length === 0) return
    setBusy(true)
    setOutcome(null)
    setProgress(0)
    const supabase = createClient()
    const result: Outcome = { created: 0, boardFailed: [], failed: [] }
    // one at a time, so a problem on one task never stops the others and the count shown is always true
    for (const [i, r] of toCreate.entries()) {
      try {
        const task = await createTask(supabase, { title: r.title, description: r.description, subsystem_id: r.subsystemId, category_id: r.categoryId })
        result.created += 1
        if (r.size) {
          try {
            await setTaskSize(supabase, task.id, r.size)
          } catch {
            result.boardFailed.push(r.title)
          }
        }
      } catch (err) {
        result.failed.push({ title: r.title, message: getErrorMessage(err, 'Could not create this task.') })
      }
      setProgress(i + 1)
    }
    setOutcome(result)
    setBusy(false)
    if (result.created > 0) setText('')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <Panel className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xs font-semibold text-text-primary">One task per line</h2>
            <p className="mt-1 font-mono text-2xs leading-5 text-text-muted">Subsystem | Category | Title | size | Description (optional)</p>
            <p className="mt-1 text-xs text-text-secondary">
              Size is quick, short or half_day, and puts the task on the Pick up board. Leave it blank to keep the task off the board. Category can be blank.
            </p>
          </div>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setText(checklistText)}>
            <ClipboardList size={12} aria-hidden="true" /> Load the competition checklist
          </Button>
        </div>
        <label htmlFor="bulk-text" className="sr-only">
          Tasks to add, one per line
        </label>
        <Textarea
          id="bulk-text"
          rows={10}
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Fabrication | Safety Mounts & Tow Points | Make the front tow hitch | short | Between the lower rails…'}
          className="mt-3 font-mono text-2xs leading-5"
        />
      </Panel>

      {rows.length > 0 && (
        <Panel className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-xs text-text-secondary">
              <span className="font-semibold text-text-primary">{counts.ok}</span> to create
              {counts.duplicate > 0 && <> · {counts.duplicate} already exist</>}
              {counts.error > 0 && <span className="text-status-danger"> · {counts.error} need fixing</span>}
            </p>
            <Button size="sm" disabled={busy || toCreate.length === 0} onClick={create}>
              <Plus size={12} aria-hidden="true" /> {busy ? `Creating… ${progress} of ${toCreate.length}` : `Create ${toCreate.length} task${toCreate.length === 1 ? '' : 's'}`}
            </Button>
          </div>
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.line} className="px-4 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`text-xs font-medium ${r.status === 'ok' ? 'text-text-primary' : 'text-text-secondary'}`}>{r.title || `Line ${r.line}`}</p>
                    <p className="mt-0.5 text-2xs text-text-muted">
                      {[r.subsystemName, r.categoryName ?? (r.status === 'error' ? null : 'No category')].filter(Boolean).join(' › ')}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    {r.size && <Badge tone="sky">{SIZE_LABEL[r.size]}</Badge>}
                    {r.status === 'ok' && <Badge tone="emerald">Ready</Badge>}
                    {r.status === 'duplicate' && <Badge tone="slate">Exists</Badge>}
                    {r.status === 'error' && <Badge tone="rose">Fix</Badge>}
                  </div>
                </div>
                {r.message && (
                  <p className={`mt-1 flex items-start gap-1 text-2xs ${r.status === 'error' ? 'text-status-danger' : 'text-text-muted'}`}>
                    {r.status === 'error' && <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" aria-hidden="true" />}
                    <span>{r.message}</span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {outcome && (
        <Panel className="p-4">
          <div role="status" className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
              <CheckCircle2 size={14} className="text-status-success" aria-hidden="true" /> Created {outcome.created} task{outcome.created === 1 ? '' : 's'}.
            </p>
            {outcome.created > 0 && (
              <p className="text-xs text-text-secondary">
                They are ordinary tasks: open any one to edit its title, description, category, priority, due date or owner.{' '}
                <Link href="/pickup" className="font-medium text-accent-blue hover:underline">
                  See them on the Pick up board
                </Link>
                .
              </p>
            )}
            {outcome.boardFailed.length > 0 && (
              <p className="text-xs text-status-warning">
                Created but not put on the board ({outcome.boardFailed.length}): {outcome.boardFailed.join('; ')}. Set the pick-up size on each task page.
              </p>
            )}
            {outcome.failed.length > 0 && (
              <div className="text-xs text-status-danger">
                <p className="font-semibold">{outcome.failed.length} could not be created:</p>
                <ul className="mt-1 list-disc pl-4">
                  {outcome.failed.map((f) => (
                    <li key={f.title}>
                      {f.title}: {f.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Panel>
      )}

      {rows.length === 0 && !outcome && (
        <p className="flex items-center gap-1.5 text-2xs text-text-muted">
          <Copy size={11} aria-hidden="true" /> Nothing yet. Paste lines above, or load the competition checklist to see how it looks.
        </p>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Pencil, Check, X } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Badge from '@/components/ui/Badge'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { updateTask } from '@/lib/supabase/queries/tasks'
import { deadlineDateKey, formatDeadline, isDeadlineOverdue } from '@/lib/deadline'
import type { Task, SubsystemCategory } from '@/types/database'

const STATUSES = ['To Do', 'In Progress', 'Blocked', 'Review', 'Complete']
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']

interface TaskDetailHeaderProps {
  task: Task
  categories: SubsystemCategory[]
  canManage: boolean
  canChangeStatus: boolean
}

export default function TaskDetailHeader({ task, categories, canManage, canChangeStatus }: TaskDetailHeaderProps) {
  const router = useRouter()
  const [editingDetails, setEditingDetails] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [priority, setPriority] = useState(task.priority)
  const [categoryId, setCategoryId] = useState(task.category_id ?? '')
  const [deadline, setDeadline] = useState(deadlineDateKey(task.deadline) ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function persist(patch: Record<string, unknown>) {
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      await updateTask(supabase, task.id, patch)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(status: string) {
    await persist({ status })
  }

  async function handleSaveDetails() {
    await persist({
      title,
      description: description || null,
      priority,
      category_id: categoryId || null,
      deadline: deadline ? new Date(deadline).toISOString() : null,
    })
    setEditingDetails(false)
  }

  return (
    <Panel className="p-5">
      <Link href="/tasks" className="mb-3 flex items-center gap-1 text-[11px] text-text-muted hover:text-accent-blue">
        <ChevronLeft size={13} /> Back to tasks
      </Link>

      {error && <p className="mb-2 text-xs text-rose-400">{error}</p>}

      {editingDetails ? (
        <div className="space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-sm font-bold" />
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
          <div className="grid grid-cols-3 gap-2">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Task['priority'])}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={saving} onClick={handleSaveDetails}>
              <Check size={12} /> Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingDetails(false)}>
              <X size={12} /> Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-base font-bold text-text-primary">{task.title}</h1>
            {canManage && (
              <button type="button" onClick={() => setEditingDetails(true)} className="flex-shrink-0 text-text-muted hover:text-accent-blue">
                <Pencil size={14} />
              </button>
            )}
          </div>
          {task.description && <p className="mt-2 whitespace-pre-wrap text-xs text-text-secondary">{task.description}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px]">
            <Badge tone="slate">{task.subsystem?.name ?? 'Unknown subsystem'}</Badge>
            {task.category?.name && <Badge tone="slate">{task.category.name}</Badge>}
            {task.deadline && (
              <span className={isDeadlineOverdue(task.deadline, task.status) ? 'font-semibold text-rose-400' : 'text-text-muted'}>
                Due {formatDeadline(task.deadline)}
              </span>
            )}
          </div>
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Status</label>
          {canManage || canChangeStatus ? (
            <Select value={task.status} disabled={saving} onChange={(e) => handleStatusChange(e.target.value)} className="w-36">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          ) : (
            <Badge tone="slate">{task.status}</Badge>
          )}
        </div>
        {!editingDetails && (
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Priority</label>
            <Badge tone="slate">{task.priority}</Badge>
          </div>
        )}
      </div>
    </Panel>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Check, X, Archive, RotateCcw, BookOpen } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { createClient } from '@/lib/supabase/client'
import { createSubsystemCategory, updateSubsystemCategory } from '@/lib/supabase/queries/subsystems'
import type { SubsystemCategory } from '@/types/database'

function CategoryRow({ category, canManage, onChanged }: { category: SubsystemCategory; canManage: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [rule, setRule] = useState(category.engineering_rule ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function persist(patch: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await updateSubsystemCategory(supabase, category.id, patch)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSave() {
    await persist({ name, engineering_rule: rule || null })
    setEditing(false)
  }

  if (editing) {
    return (
      <li className="rounded-lg border border-border p-2.5">
        <div className="space-y-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea rows={2} value={rule} onChange={(e) => setRule(e.target.value)} placeholder="Engineering rule" />
          {error && <p className="text-[11px] text-rose-400">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={handleSave}>
              <Check size={11} /> Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              <X size={11} /> Cancel
            </Button>
          </div>
        </div>
      </li>
    )
  }

  return (
    <li className={!category.active ? 'opacity-50' : ''}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-text-primary">{category.name}</span>
            {!category.active && <Badge tone="rose">Archived</Badge>}
          </div>
          {category.engineering_rule && <p className="mt-0.5 text-[11px] text-text-secondary">{category.engineering_rule}</p>}
        </div>
        {canManage && (
          <div className="flex flex-shrink-0 gap-2">
            <button type="button" onClick={() => setEditing(true)} className="text-text-muted hover:text-accent-blue">
              <Pencil size={12} />
            </button>
            <button type="button" disabled={busy} onClick={() => persist({ active: !category.active })} className="text-text-muted hover:text-rose-400" title={category.active ? 'Archive' : 'Restore'}>
              {category.active ? <Archive size={12} /> : <RotateCcw size={12} />}
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

interface CategoryManagementPanelProps {
  subsystemId: string
  categories: SubsystemCategory[]
  canManage: boolean
}

export default function CategoryManagementPanel({ subsystemId, categories, canManage }: CategoryManagementPanelProps) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [rule, setRule] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await createSubsystemCategory(supabase, { subsystem_id: subsystemId, name, engineering_rule: rule || null })
      setName('')
      setRule('')
      setAdding(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add category.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BookOpen size={13} className="text-accent-blue" />
          <h2 className="text-xs font-bold uppercase tracking-wide text-text-primary">Categories &amp; Engineering Rules</h2>
        </div>
        {canManage && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="text-[10px] font-mono uppercase text-accent-blue hover:underline">
            <Plus size={11} className="mr-0.5 inline" /> Add
          </button>
        )}
      </div>

      {error && <p className="mb-2 text-[11px] text-rose-400">{error}</p>}

      {categories.length === 0 && !adding ? (
        <EmptyState title="No categories defined yet" />
      ) : (
        <ul className="space-y-2.5">
          {categories.map((c) => (
            <CategoryRow key={c.id} category={c} canManage={canManage} onChanged={() => router.refresh()} />
          ))}
        </ul>
      )}

      {canManage && adding && (
        <form onSubmit={handleAdd} className="mt-3 space-y-2 border-t border-border pt-3 text-xs">
          <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Category name" />
          <Textarea rows={2} value={rule} onChange={(e) => setRule(e.target.value)} placeholder="Engineering rule (optional)" />
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={busy || !name}>
              Add
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Panel>
  )
}

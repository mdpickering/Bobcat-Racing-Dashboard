'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Phone, Plus, UserRound, X } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import { createClient } from '@/lib/supabase/client'
import { addSponsorContact, removeSponsorContact } from '@/lib/supabase/queries/sponsorships'
import { getErrorMessage } from '@/lib/errors'
import type { SponsorContact } from '@/types/database'

interface ContactsPanelProps {
  sponsorId: string
  contacts: SponsorContact[]
  canManage: boolean
}

export default function ContactsPanel({ sponsorId, contacts, canManage }: ContactsPanelProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', title: '', email: '', phone: '', is_primary: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasDetail = [form.name, form.email, form.phone].some((v) => v.trim() !== '')
  const set = (key: keyof typeof form, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }))

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true)
    setError(null)
    try {
      await action()
      router.refresh()
      return true
    } catch (err) {
      setError(getErrorMessage(err, failure))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!hasDetail || busy) return
    const ok = await run(() => addSponsorContact(createClient(), { sponsor_id: sponsorId, ...form }), 'Could not add this contact.')
    if (ok) {
      setOpen(false)
      setForm({ name: '', title: '', email: '', phone: '', is_primary: false })
    }
  }

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-text-primary">
          <UserRound size={13} className="text-accent-blue" /> Contacts
        </h2>
        {canManage && (
          <Button size="sm" variant="secondary" onClick={() => { setError(null); setOpen(true) }}>
            <Plus size={12} /> Add contact
          </Button>
        )}
      </div>
      {error && !open && <p className="mb-2 text-xs text-rose-400">{error}</p>}

      {contacts.length === 0 ? (
        <p className="text-[11px] text-text-muted">No contacts recorded.</p>
      ) : (
        <ul className="divide-y divide-border">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 py-2.5 text-xs first:pt-0 last:pb-0">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-text-primary">{c.name || c.email || c.phone}</span>
                  {c.is_primary && <Badge tone="gold">Primary</Badge>}
                  {!c.active && <Badge tone="slate">Inactive</Badge>}
                </div>
                {c.title && <div className="text-[10px] text-text-muted">{c.title}</div>}
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-text-secondary">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-accent-blue">
                      <Mail size={11} /> {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone size={11} /> {c.phone}
                    </span>
                  )}
                </div>
              </div>
              {canManage && (
                <button
                  type="button"
                  title="Remove this contact"
                  disabled={busy}
                  onClick={() => run(() => removeSponsorContact(createClient(), c.id), 'Could not remove this contact.')}
                  className="flex-shrink-0 text-text-muted hover:text-rose-400"
                >
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} onClose={busy ? () => {} : () => setOpen(false)} title="Add a contact" maxWidthClassName="max-w-md">
        <form onSubmit={handleAdd} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Name</label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} disabled={busy} autoFocus />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Title</label>
              <Input value={form.title} onChange={(e) => set('title', e.target.value)} disabled={busy} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Email</label>
              <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} disabled={busy} />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Phone</label>
              <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} disabled={busy} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-text-secondary">
            <input type="checkbox" checked={form.is_primary} onChange={(e) => set('is_primary', e.target.checked)} disabled={busy} /> Primary contact
          </label>
          {error && <p className="text-rose-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !hasDetail}>
              {busy ? 'Adding…' : 'Add contact'}
            </Button>
          </div>
        </form>
      </Modal>
    </Panel>
  )
}

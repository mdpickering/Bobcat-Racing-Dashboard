'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { deleteSponsor } from '@/lib/supabase/queries/sponsorships'
import { getErrorMessage } from '@/lib/errors'

interface DeleteSponsorButtonProps {
  sponsorId: string
  sponsorName: string
}

// Permanent deletion, gated by the database (delete_sponsor, migration 0039): only the Sponsorship Lead, the
// Business Lead or an admin can call it, and it refuses — with a clear reason — if this sponsor has any
// sponsorship (or anything recorded under one) in any season. This button is only rendered for someone
// getSponsorshipAccess already said canManage, but the real gate is the database call itself.
export default function DeleteSponsorButton({ sponsorId, sponsorName }: DeleteSponsorButtonProps) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const matches = confirmText === sponsorName
  const close = () => {
    if (busy) return
    setOpen(false)
    setConfirmText('')
    setError(null)
  }

  // No <form> here on purpose: an Enter keypress in the confirmation field must do nothing, not submit.
  async function handleDelete() {
    if (busy || !matches) return
    setBusy(true)
    setError(null)
    try {
      const name = await deleteSponsor(createClient(), sponsorId)
      setOpen(false)
      toast.push(`"${name}" was permanently deleted.`, 'success')
      router.push('/business/sponsorships')
      router.refresh()
    } catch (err) {
      // The database's own message is already a plain-language explanation (permission, or which dependent
      // records exist) — never a raw Postgres error, so it's safe to show as-is.
      setError(getErrorMessage(err, 'Could not delete this sponsor.'))
      setBusy(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="danger" onClick={() => { setError(null); setConfirmText(''); setOpen(true) }}>
        <Trash2 size={13} /> Delete sponsor
      </Button>

      <Modal open={open} onClose={close} title="Delete sponsor" maxWidthClassName="max-w-sm">
        <div className="space-y-4 text-xs">
          <div className="space-y-2 text-text-secondary">
            <p>
              You are about to permanently delete <span className="font-semibold text-text-primary">&ldquo;{sponsorName}&rdquo;</span>.
            </p>
            <p className="text-status-danger">This cannot be undone. It does not archive the sponsor — the record is gone.</p>
            <p>This only works when the sponsor has no real sponsorship history — an empty, still-prospect record is fine, but any contribution, payment, level, deliverable, renewal or committed/declined sponsorship blocks it. If it does, deletion is refused and nothing changes.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-secondary">
              Type <span className="font-semibold text-text-primary">{sponsorName}</span> to confirm
            </label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={busy}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              onKeyDown={(e) => {
                // belt and suspenders: Enter never triggers the delete, even with a matching value
                if (e.key === 'Enter') e.preventDefault()
              }}
            />
          </div>
          {error && <p className="text-status-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={close}>
              Cancel
            </Button>
            <Button type="button" variant="danger" disabled={busy || !matches} onClick={handleDelete}>
              {busy ? 'Deleting…' : 'Delete sponsor'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

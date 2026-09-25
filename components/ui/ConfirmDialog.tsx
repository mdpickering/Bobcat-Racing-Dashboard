'use client'

import Modal from './Modal'
import Button from './Button'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: React.ReactNode
  confirmLabel?: string
  busyLabel?: string
  busy?: boolean
  error?: string | null
}

// Confirmation step for destructive actions: the action button is the danger variant and
// stays disabled while the request is in flight so it can't be submitted twice.
export default function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Delete', busyLabel = 'Deleting…', busy = false, error }: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={title} maxWidthClassName="max-w-sm">
      <div className="space-y-4 text-xs">
        <div className="space-y-2 text-text-secondary">{description}</div>
        {error && <p className="text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="danger" disabled={busy} onClick={onConfirm}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

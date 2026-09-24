'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { adminSetUserRole, adminSetUserApproved, adminSetUserActive } from '@/lib/supabase/queries/admin'
import type { Profile, UserRole } from '@/types/user'

const ROLES: UserRole[] = ['member', 'team_lead', 'coo', 'cto', 'admin']

export default function UserRoleAndStatusPanel({ user, isSelf }: { user: Profile; isSelf: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRoleChange(role: string) {
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await adminSetUserRole(supabase, user.id, role as UserRole)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change role.')
    } finally {
      setBusy(false)
    }
  }

  async function handleApprovedToggle() {
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await adminSetUserApproved(supabase, user.id, !user.approved)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change approval status.')
    } finally {
      setBusy(false)
    }
  }

  async function handleActiveToggle() {
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      await adminSetUserActive(supabase, user.id, !user.active)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change active status.')
    } finally {
      setBusy(false)
    }
  }

  if (isSelf) {
    return (
      <Panel className="p-4">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <ShieldAlert size={14} />
          You cannot change your own role, approval, or active status.
        </div>
      </Panel>
    )
  }

  return (
    <Panel className="p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-text-primary">Role &amp; Status</h3>
      {error && <p className="mb-2 text-[11px] text-rose-400">{error}</p>}

      <div className="space-y-3 text-xs">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Role</label>
          <Select value={user.role} disabled={busy} onChange={(e) => handleRoleChange(e.target.value)} className="w-44">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r.replace('_', ' ')}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
          <span className="text-text-secondary">Approved</span>
          <Button size="sm" variant={user.approved ? 'secondary' : 'primary'} disabled={busy} onClick={handleApprovedToggle}>
            {user.approved ? 'Revoke approval' : 'Approve'}
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
          <span className="text-text-secondary">Active</span>
          <Button size="sm" variant={user.active ? 'danger' : 'secondary'} disabled={busy} onClick={handleActiveToggle}>
            {user.active ? 'Deactivate' : 'Reactivate'}
          </Button>
        </div>
      </div>
    </Panel>
  )
}

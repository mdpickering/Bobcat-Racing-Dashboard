'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Briefcase, Star, UserPlus, X } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Avatar from '@/components/ui/Avatar'
import EmptyState from '@/components/ui/EmptyState'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { createClient } from '@/lib/supabase/client'
import { addBusinessMember, removeBusinessMember, setBusinessLead, setBusinessResponsibility } from '@/lib/supabase/queries/business'
import { getErrorMessage } from '@/lib/errors'
import type { BusinessMember } from '@/types/database'

interface Candidate {
  id: string
  display_name: string | null
  email: string | null
  year: string | null
}

interface BusinessTeamPanelProps {
  members: BusinessMember[]
  candidates: Candidate[]
  currentUserId: string
  // Business Lead and cto/admin: add and remove members, appoint a Sponsorship Lead.
  canManageTeam: boolean
  // cto/admin only: make or remove a Business Lead.
  canManageLeads: boolean
}

const nameOf = (p: { display_name: string | null; email: string | null } | null | undefined) => p?.display_name || p?.email || 'Unknown'

// The database (migration 0033) enforces every rule here; the buttons only mirror them so nobody is offered an
// action that would be refused.
export default function BusinessTeamPanel({ members, candidates, currentUserId, canManageTeam, canManageLeads }: BusinessTeamPanelProps) {
  const router = useRouter()
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<BusinessMember | null>(null)

  const hasSponsorshipLead = (m: BusinessMember) => (m.responsibilities ?? []).some((r) => r.responsibility === 'sponsorship_lead')
  // a Business Lead removes regular members, or steps down themselves; only cto/admin removes another lead
  const canRemove = (m: BusinessMember) => canManageLeads || (canManageTeam && (!m.is_lead || m.user_id === currentUserId))

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true)
    setError(null)
    try {
      await action()
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, failure))
    } finally {
      setBusy(false)
    }
  }

  async function handleAdd() {
    if (!selected) return
    await run(async () => {
      await addBusinessMember(createClient(), selected)
      setSelected('')
    }, 'Could not add this member.')
  }

  async function handleConfirmRemove() {
    if (!removing) return
    setBusy(true)
    setError(null)
    try {
      await removeBusinessMember(createClient(), removing.user_id)
      setRemoving(null)
      router.refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not remove this member.'))
      setRemoving(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {canManageTeam && (
        <Panel className="p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-text-primary">
            <UserPlus size={13} className="text-accent-blue" /> Add a member
          </h2>
          {candidates.length === 0 ? (
            <p className="text-[11px] text-text-muted">Everyone with an approved account is already on the Business team.</p>
          ) : (
            <div className="flex items-center gap-2">
              <Select value={selected} onChange={(e) => setSelected(e.target.value)} className="flex-1" aria-label="Person to add">
                <option value="">Select a person…</option>
                {candidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name ? `${p.display_name} — ${p.email}` : p.email}
                    {p.year ? ` (${p.year})` : ''}
                  </option>
                ))}
              </Select>
              <Button size="sm" disabled={!selected || busy} onClick={handleAdd}>
                {busy ? 'Working…' : 'Add to Business team'}
              </Button>
            </div>
          )}
          {!canManageLeads && <p className="mt-2 text-[11px] text-text-muted">New members join as regular Business members. An admin or the CTO makes someone a Business Lead.</p>}
        </Panel>
      )}

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <Panel className="p-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-text-primary">
          <Briefcase size={13} className="text-accent-blue" /> Business team ({members.length})
        </h2>

        {members.length === 0 ? (
          <EmptyState
            title="No Business members yet"
            description={canManageLeads ? 'Add the first member, then make them the Business Lead.' : 'An admin or the CTO sets up the Business team.'}
          />
        ) : (
          <ul className="divide-y divide-border">
            {members.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={nameOf(m.profile)} src={m.profile?.avatar_url} size={28} />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-text-primary">
                      {nameOf(m.profile)}
                      {m.user_id === currentUserId && <span className="ml-1.5 text-[10px] text-text-muted">(you)</span>}
                    </div>
                    {m.profile?.display_name && <div className="truncate text-[10px] text-text-muted">{m.profile.email}</div>}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {m.is_lead && <Badge tone="gold">Business Lead</Badge>}
                  {hasSponsorshipLead(m) && <Badge tone="sky">Sponsorship Lead</Badge>}

                  {canManageTeam && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => setBusinessResponsibility(createClient(), m.user_id, 'sponsorship_lead', !hasSponsorshipLead(m)),
                          'Could not change the Sponsorship Lead.'
                        )
                      }
                    >
                      {hasSponsorshipLead(m) ? 'Remove Sponsorship Lead' : 'Make Sponsorship Lead'}
                    </Button>
                  )}
                  {canManageLeads && (
                    <button
                      type="button"
                      disabled={busy}
                      title={m.is_lead ? 'Remove Business Lead' : 'Make Business Lead'}
                      onClick={() => run(() => setBusinessLead(createClient(), m.user_id, !m.is_lead), 'Could not change the Business Lead.')}
                      className={m.is_lead ? 'text-qu-gold' : 'text-text-muted hover:text-qu-gold'}
                    >
                      <Star size={14} />
                    </button>
                  )}
                  {canRemove(m) && (
                    <button
                      type="button"
                      disabled={busy}
                      title={m.user_id === currentUserId ? 'Leave the Business team' : 'Remove from the Business team'}
                      onClick={() => setRemoving(m)}
                      className="text-text-muted hover:text-rose-400"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {!canManageTeam && members.length > 0 && <p className="mt-3 text-[11px] text-text-muted">You can see the Business team. Only the Business Lead (or an admin) changes it.</p>}
      </Panel>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={handleConfirmRemove}
        title={removing?.user_id === currentUserId ? 'Leave the Business team?' : 'Remove from the Business team?'}
        confirmLabel={removing?.user_id === currentUserId ? 'Leave' : 'Remove'}
        busyLabel="Removing…"
        busy={busy}
        description={
          <>
            <p>
              <span className="font-semibold text-text-primary">{nameOf(removing?.profile)}</span> will lose all Business access, including any Business Lead or Sponsorship Lead responsibility.
            </p>
            <p>Their account and everything else in the dashboard stay exactly as they are.</p>
          </>
        }
      />
    </div>
  )
}

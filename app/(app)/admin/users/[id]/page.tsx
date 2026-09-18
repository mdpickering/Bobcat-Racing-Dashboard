import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfileById } from '@/lib/supabase/queries/admin'
import { listMySubsystems, listSubsystems } from '@/lib/supabase/queries/subsystems'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'
import { PermissionDeniedState } from '@/components/ui/ErrorState'
import ErrorState from '@/components/ui/ErrorState'
import Panel from '@/components/ui/Panel'
import Badge from '@/components/ui/Badge'
import Avatar from '@/components/ui/Avatar'
import UserRoleAndStatusPanel from '@/components/admin/UserRoleAndStatusPanel'
import UserSubsystemMemberships from '@/components/admin/UserSubsystemMemberships'
import { ChevronLeft } from 'lucide-react'
import { formatDate } from '@/lib/format'

export default async function AdminUserDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()

  if (!profile) return <ErrorState message="Could not load your profile." />
  const p = profile as Profile
  if (!isCtoOrAdmin(p)) return <PermissionDeniedState message="User management is limited to CTO and Admin accounts." />

  let targetUser
  try {
    targetUser = await getProfileById(supabase, params.id)
  } catch {
    return <ErrorState message="Could not load this user." />
  }
  if (!targetUser) notFound()

  const [memberships, allSubsystems] = await Promise.all([
    listMySubsystems(supabase, targetUser.id).catch(() => []),
    listSubsystems(supabase).catch(() => []),
  ])

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/admin/users" className="flex items-center gap-1 text-[11px] text-text-muted hover:text-accent-blue">
        <ChevronLeft size={13} /> Back to users
      </Link>

      <Panel className="p-5">
        <div className="flex items-center gap-4">
          <Avatar name={targetUser.display_name || targetUser.email} src={targetUser.avatar_url} size={56} />
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold text-text-primary">{targetUser.display_name || 'Unnamed'}</h1>
            <p className="truncate text-xs text-text-muted">{targetUser.email}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge tone="gold">{targetUser.role.replace('_', ' ')}</Badge>
              <Badge tone={targetUser.approved ? 'emerald' : 'amber'}>{targetUser.approved ? 'Approved' : 'Pending approval'}</Badge>
              {!targetUser.active && <Badge tone="rose">Inactive</Badge>}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs sm:grid-cols-3">
          <div>
            <div className="font-mono text-[10px] uppercase text-text-muted">Year</div>
            <div className="mt-0.5 text-text-primary">{targetUser.year || '—'}</div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase text-text-muted">Major</div>
            <div className="mt-0.5 text-text-primary">{targetUser.major || '—'}</div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase text-text-muted">Joined</div>
            <div className="mt-0.5 text-text-primary">{formatDate(targetUser.created_at)}</div>
          </div>
          <div className="col-span-2 sm:col-span-3">
            <div className="font-mono text-[10px] uppercase text-text-muted">Skills</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {targetUser.skills && targetUser.skills.length > 0 ? (
                targetUser.skills.map((s) => (
                  <Badge key={s} tone="slate">
                    {s}
                  </Badge>
                ))
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </div>
          </div>
        </div>
      </Panel>

      <UserRoleAndStatusPanel user={targetUser} isSelf={targetUser.id === p.id} />
      <UserSubsystemMemberships userId={targetUser.id} memberships={memberships} allSubsystems={allSubsystems} />
    </div>
  )
}

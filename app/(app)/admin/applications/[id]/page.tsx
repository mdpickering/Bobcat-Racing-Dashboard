import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMemberApplicationById } from '@/lib/supabase/queries/admin'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'
import { PermissionDeniedState } from '@/components/ui/ErrorState'
import ErrorState from '@/components/ui/ErrorState'
import Panel from '@/components/ui/Panel'
import Badge from '@/components/ui/Badge'
import ApplicationReviewPanel from '@/components/admin/ApplicationReviewPanel'
import { ChevronLeft } from 'lucide-react'
import { formatDate } from '@/lib/format'

const STATUS_TONE: Record<string, 'amber' | 'emerald' | 'rose'> = {
  pending: 'amber',
  approved: 'emerald',
  rejected: 'rose',
}

export default async function AdminApplicationDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()

  if (!profile) return <ErrorState message="Could not load your profile." />
  const p = profile as Profile
  if (!isCtoOrAdmin(p)) return <PermissionDeniedState message="Membership applications are limited to CTO and Admin accounts." />

  let application
  try {
    application = await getMemberApplicationById(supabase, params.id)
  } catch {
    return <ErrorState message="Could not load this application." />
  }
  if (!application) notFound()

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/admin/applications" className="flex items-center gap-1 text-[11px] text-text-muted hover:text-accent-blue">
        <ChevronLeft size={13} /> Back to applications
      </Link>

      <Panel className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-base font-bold text-text-primary">{application.name}</h1>
            <p className="text-xs text-text-muted">{application.email}</p>
          </div>
          <Badge tone={STATUS_TONE[application.status]}>{application.status}</Badge>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs sm:grid-cols-3">
          <div>
            <div className="font-mono text-[10px] uppercase text-text-muted">Year</div>
            <div className="mt-0.5 text-text-primary">{application.year || '—'}</div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase text-text-muted">Experience</div>
            <div className="mt-0.5 text-text-primary">{application.experience_level || '—'}</div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase text-text-muted">Weekly Hours</div>
            <div className="mt-0.5 text-text-primary">{application.weekly_hours ?? '—'}</div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase text-text-muted">Submitted</div>
            <div className="mt-0.5 text-text-primary">{formatDate(application.submitted_at)}</div>
          </div>
        </div>

        <div className="mt-4 border-t border-border pt-4 text-xs">
          <div className="font-mono text-[10px] uppercase text-text-muted">Skills</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {application.skills && application.skills.length > 0 ? (
              application.skills.map((s) => (
                <Badge key={s} tone="slate">
                  {s}
                </Badge>
              ))
            ) : (
              <span className="text-text-muted">—</span>
            )}
          </div>
        </div>

        {application.goals && (
          <div className="mt-4 border-t border-border pt-4 text-xs">
            <div className="font-mono text-[10px] uppercase text-text-muted">Goals</div>
            <p className="mt-1 whitespace-pre-wrap text-text-secondary">{application.goals}</p>
          </div>
        )}
      </Panel>

      <ApplicationReviewPanel application={application} currentUserId={p.id} />
    </div>
  )
}

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { listMemberApplications } from '@/lib/supabase/queries/admin'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'
import { PermissionDeniedState } from '@/components/ui/ErrorState'
import ErrorState from '@/components/ui/ErrorState'
import AdminNav from '@/components/admin/AdminNav'
import ApplicationList from '@/components/admin/ApplicationList'

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined }
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()

  if (!profile) return <ErrorState message="Could not load your profile." />
  const p = profile as Profile
  if (!isCtoOrAdmin(p)) return <PermissionDeniedState message="Membership applications are limited to CTO and Admin accounts." />

  const status = searchParams.status ?? 'pending'

  let applications
  try {
    applications = await listMemberApplications(supabase, { status: status || undefined })
  } catch {
    return <ErrorState message="Could not load applications." />
  }

  const tabs = [
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: '', label: 'All' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Membership Applications</h1>
        <p className="mt-0.5 text-xs font-mono text-text-muted">
          {applications.length} application{applications.length === 1 ? '' : 's'}
        </p>
      </div>
      <AdminNav />
      <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
        {tabs.map((tab) => (
          <Link
            key={tab.key || 'all'}
            href={`/admin/applications${tab.key ? `?status=${tab.key}` : ''}`}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              status === tab.key ? 'bg-accent-blue/15 text-text-primary' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      <ApplicationList applications={applications} />
    </div>
  )
}

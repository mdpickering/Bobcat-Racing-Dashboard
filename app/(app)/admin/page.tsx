import { createClient } from '@/lib/supabase/server'
import { getAdminOverviewCounts, listRecentActivity } from '@/lib/supabase/queries/admin'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'
import { PermissionDeniedState } from '@/components/ui/ErrorState'
import ErrorState from '@/components/ui/ErrorState'
import AdminNav from '@/components/admin/AdminNav'
import AdminStatCard from '@/components/admin/AdminStatCard'
import RecentActivityPanel from '@/components/admin/RecentActivityPanel'
import { UserCheck, Inbox, ListChecks, ShoppingCart, Ruler } from 'lucide-react'

export default async function AdminPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()

  if (!profile) return <ErrorState message="Could not load your profile." />
  const p = profile as Profile
  if (!isCtoOrAdmin(p)) return <PermissionDeniedState message="Administration is limited to CTO and Admin accounts." />

  let counts, recentActivity
  try {
    ;[counts, recentActivity] = await Promise.all([getAdminOverviewCounts(supabase), listRecentActivity(supabase, 10)])
  } catch {
    return <ErrorState message="Could not load the admin overview." />
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Administration</h1>
        <p className="mt-0.5 text-xs font-mono text-text-muted">Team, subsystem, and organization-wide operations.</p>
      </div>

      <AdminNav />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <AdminStatCard label="Active Members" value={counts.activeMemberCount} icon={UserCheck} href="/admin/users" />
        <AdminStatCard label="Pending Applications" value={counts.pendingApplicationCount} icon={Inbox} href="/admin/applications" tone={counts.pendingApplicationCount > 0 ? 'warning' : 'default'} />
        <AdminStatCard label="Pending Task Requests" value={counts.pendingTaskRequestCount} icon={ListChecks} href="/tasks?tab=requests" tone={counts.pendingTaskRequestCount > 0 ? 'warning' : 'default'} />
        <AdminStatCard label="Purchasing Needs Review" value={counts.purchaseNeedsAttentionCount} icon={ShoppingCart} href="/purchasing" tone={counts.purchaseNeedsAttentionCount > 0 ? 'warning' : 'default'} />
        <AdminStatCard label="CAD Needs Review" value={counts.cadNeedsAttentionCount} icon={Ruler} href="/cad" tone={counts.cadNeedsAttentionCount > 0 ? 'warning' : 'default'} />
      </div>

      <RecentActivityPanel items={recentActivity} />
    </div>
  )
}

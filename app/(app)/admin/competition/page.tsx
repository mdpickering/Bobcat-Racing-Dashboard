import { createClient } from '@/lib/supabase/server'
import { listAllCompetitionSettings } from '@/lib/supabase/queries/competition'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'
import { PermissionDeniedState } from '@/components/ui/ErrorState'
import ErrorState from '@/components/ui/ErrorState'
import AdminNav from '@/components/admin/AdminNav'
import CompetitionSettingsForm from '@/components/admin/CompetitionSettingsForm'

export default async function AdminCompetitionPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()

  if (!profile) return <ErrorState message="Could not load your profile." />
  const p = profile as Profile
  if (!isCtoOrAdmin(p)) return <PermissionDeniedState message="Competition settings are limited to CTO and Admin accounts." />

  let seasons
  try {
    seasons = await listAllCompetitionSettings(supabase)
  } catch {
    return <ErrorState message="Could not load competition settings." />
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Competition Settings</h1>
        <p className="mt-0.5 text-xs font-mono text-text-muted">Dates that drive the dashboard countdown and season timeline.</p>
      </div>
      <AdminNav />
      <CompetitionSettingsForm seasons={seasons} />
    </div>
  )
}

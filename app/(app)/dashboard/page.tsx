import { createClient } from '@/lib/supabase/server'
import Panel from '@/components/ui/Panel'

export default async function DashboardPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single()

  return (
    <div className="space-y-4">
      <Panel className="p-6">
        <h1 className="text-lg font-bold">
          Welcome, {profile?.display_name || profile?.email}
        </h1>
        <p className="text-xs font-mono text-slate-400 mt-1">
          This is a placeholder dashboard. Tasks, purchasing, CAD, and the
          rest of the application arrive in later phases.
        </p>
      </Panel>
    </div>
  )
}

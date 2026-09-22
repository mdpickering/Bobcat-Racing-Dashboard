import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSubsystemById, listSubsystemCategories, listAllSubsystemCategories, listSubsystemMembers, listUnassignedApprovedProfiles } from '@/lib/supabase/queries/subsystems'
import { listAllProfiles } from '@/lib/supabase/queries/admin'
import { listTasks } from '@/lib/supabase/queries/tasks'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'
import Panel from '@/components/ui/Panel'
import ErrorState from '@/components/ui/ErrorState'
import TaskList from '@/components/tasks/TaskList'
import SubsystemEditPanel from '@/components/subsystems/SubsystemEditPanel'
import CategoryManagementPanel from '@/components/subsystems/CategoryManagementPanel'
import SubsystemMembersPanel from '@/components/subsystems/SubsystemMembersPanel'
import { ChevronLeft } from 'lucide-react'

export default async function SubsystemDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  const profile = profileRow as Profile

  let subsystem
  try {
    subsystem = await getSubsystemById(supabase, params.id)
  } catch {
    return <ErrorState message="Could not load this subsystem." />
  }
  if (!subsystem) notFound()

  const admin = isCtoOrAdmin(profile)

  const [members, tasks] = await Promise.all([
    listSubsystemMembers(supabase, params.id).catch(() => []),
    listTasks(supabase, { subsystemId: params.id }).catch(() => []),
  ])

  const isLeadHere = members.some((m) => m.user_id === profile.id && m.is_lead)
  const canManageCategories = admin || isLeadHere
  // Self-accept (migration 0024): only an approved member of THIS subsystem sees the Accept
  // button — accept_task() re-checks the same thing server-side, this only decides display.
  const isMemberHere = members.some((m) => m.user_id === profile.id)
  const canAcceptTasks = isMemberHere && profile.approved && profile.active

  // Member-management candidate pool (migration 0025): admin keeps its existing full "any
  // approved profile" picker; a lead-only viewer gets the narrower "eligible new members" list
  // (approved, active, not yet on any team) instead — matching what subsystem_members_insert_own_team
  // actually allows them to add. A viewer who is neither sees no picker at all (canManageMembers below).
  const canManageMembers = admin || isLeadHere
  const [categories, candidateProfiles] = await Promise.all([
    admin ? listAllSubsystemCategories(supabase, params.id).catch(() => []) : listSubsystemCategories(supabase, params.id).catch(() => []),
    admin
      ? listAllProfiles(supabase, { approved: 'true' }).catch(() => [])
      : isLeadHere
        ? listUnassignedApprovedProfiles(supabase).catch(() => [])
        : Promise.resolve([]),
  ])

  const leads = members.filter((m) => m.is_lead)
  const openTasks = tasks.filter((t) => t.status !== 'Complete')

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/subsystems" className="flex items-center gap-1 text-[11px] text-text-muted hover:text-accent-blue">
        <ChevronLeft size={13} /> Back to subsystems
      </Link>

      {admin ? <SubsystemEditPanel subsystem={subsystem} leads={leads} /> : (
        <Panel className="p-5">
          <h1 className="text-base font-bold text-text-primary">{subsystem.name}</h1>
          {subsystem.description && <p className="mt-2 text-xs text-text-secondary">{subsystem.description}</p>}
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SubsystemMembersPanel
          subsystemId={params.id}
          subsystemName={subsystem.name}
          members={members}
          candidateProfiles={candidateProfiles}
          canManage={canManageMembers}
          canRemoveOrPromote={admin}
        />
        <CategoryManagementPanel subsystemId={params.id} categories={categories} canManage={canManageCategories} />
      </div>

      <div>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-text-primary">
          Open Tasks ({openTasks.length})
        </h2>
        <TaskList tasks={openTasks} canAccept={canAcceptTasks} />
      </div>
    </div>
  )
}

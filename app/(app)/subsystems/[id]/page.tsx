import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSubsystemById, listSubsystemCategories, listSubsystemMembers } from '@/lib/supabase/queries/subsystems'
import { listTasks } from '@/lib/supabase/queries/tasks'
import Panel from '@/components/ui/Panel'
import Badge from '@/components/ui/Badge'
import Avatar from '@/components/ui/Avatar'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import TaskList from '@/components/tasks/TaskList'
import { ChevronLeft, BookOpen, Users } from 'lucide-react'

export default async function SubsystemDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  let subsystem
  try {
    subsystem = await getSubsystemById(supabase, params.id)
  } catch {
    return <ErrorState message="Could not load this subsystem." />
  }
  if (!subsystem) notFound()

  const [categories, members, tasks] = await Promise.all([
    listSubsystemCategories(supabase, params.id).catch(() => []),
    listSubsystemMembers(supabase, params.id).catch(() => []),
    listTasks(supabase, { subsystemId: params.id }).catch(() => []),
  ])

  const leads = members.filter((m) => m.is_lead)
  const openTasks = tasks.filter((t) => t.status !== 'Complete')

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/subsystems" className="flex items-center gap-1 text-[11px] text-text-muted hover:text-accent-blue">
        <ChevronLeft size={13} /> Back to subsystems
      </Link>

      <Panel className="p-5">
        <h1 className="text-base font-bold text-text-primary">{subsystem.name}</h1>
        {subsystem.description && <p className="mt-2 text-xs text-text-secondary">{subsystem.description}</p>}
        {leads.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-mono uppercase text-text-muted">Led by</span>
            {leads.map((l) => (
              <span key={l.user_id} className="flex items-center gap-1.5 rounded-full border border-qu-gold/30 bg-qu-gold/10 px-2 py-0.5 text-[11px] text-qu-gold">
                <Avatar name={l.profile?.display_name || l.profile?.email} src={l.profile?.avatar_url} size={16} />
                {l.profile?.display_name || l.profile?.email}
              </span>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel className="p-4">
          <div className="mb-3 flex items-center gap-1.5">
            <Users size={13} className="text-accent-blue" />
            <h2 className="text-xs font-bold uppercase tracking-wide text-text-primary">Members ({members.length})</h2>
          </div>
          {members.length === 0 ? (
            <EmptyState title="No members yet" />
          ) : (
            <ul className="space-y-1.5">
              {members.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs">
                  <span className="flex items-center gap-2">
                    <Avatar name={m.profile?.display_name || m.profile?.email} src={m.profile?.avatar_url} size={22} />
                    {m.profile?.display_name || m.profile?.email}
                  </span>
                  {m.is_lead && <Badge tone="gold">Lead</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="p-4">
          <div className="mb-3 flex items-center gap-1.5">
            <BookOpen size={13} className="text-accent-blue" />
            <h2 className="text-xs font-bold uppercase tracking-wide text-text-primary">Categories & Engineering Rules</h2>
          </div>
          {categories.length === 0 ? (
            <EmptyState title="No categories defined yet" />
          ) : (
            <ul className="space-y-2.5">
              {categories.map((c) => (
                <li key={c.id}>
                  <div className="text-xs font-semibold text-text-primary">{c.name}</div>
                  {c.engineering_rule && <p className="mt-0.5 text-[11px] text-text-secondary">{c.engineering_rule}</p>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-text-primary">
          Open Tasks ({openTasks.length})
        </h2>
        <TaskList tasks={openTasks} />
      </div>
    </div>
  )
}

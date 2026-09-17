import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { listSubsystems } from '@/lib/supabase/queries/subsystems'
import Panel from '@/components/ui/Panel'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import { Boxes, ChevronRight } from 'lucide-react'

export default async function SubsystemsPage() {
  const supabase = createClient()
  let subsystems
  try {
    subsystems = await listSubsystems(supabase)
  } catch {
    return <ErrorState message="Could not load subsystems." />
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Subsystems</h1>
        <p className="mt-0.5 text-xs font-mono text-text-muted">The engineering groups that make up the car.</p>
      </div>

      {subsystems.length === 0 ? (
        <EmptyState icon={Boxes} title="No active subsystems" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {subsystems.map((s) => (
            <Link key={s.id} href={`/subsystems/${s.id}`}>
              <Panel className="flex items-center justify-between p-4 transition-colors hover:border-accent-blue/40">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold text-text-primary">{s.name}</h2>
                  {s.description && <p className="mt-1 line-clamp-2 text-[11px] text-text-secondary">{s.description}</p>}
                </div>
                <ChevronRight size={16} className="flex-shrink-0 text-text-muted" />
              </Panel>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

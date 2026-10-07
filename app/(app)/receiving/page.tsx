import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getInventoryAccess, listReceivingStatus } from '@/lib/supabase/queries/inventory'
import { listSubsystems } from '@/lib/supabase/queries/subsystems'
import type { Profile } from '@/types/user'
import ErrorState from '@/components/ui/ErrorState'
import PageHeader from '@/components/ui/PageHeader'
import ReceivingTable from '@/components/receiving/ReceivingTable'

export const metadata = { title: 'Receiving' }

const TABS = [
  { id: 'needs', label: 'Needs Receiving' },
  { id: 'recent', label: 'Recently Received' },
] as const

export default async function ReceivingPage({ searchParams }: { searchParams: { [key: string]: string | undefined } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  if (!profileRow) return <ErrorState message="Could not load your profile." />
  const profile = profileRow as Profile

  let rows, subsystems
  try {
    ;[rows, subsystems] = await Promise.all([listReceivingStatus(supabase), listSubsystems(supabase)])
  } catch {
    return <ErrorState message="Could not load receiving." />
  }
  const access = await getInventoryAccess(supabase, profile)
  const subsystemNames = Object.fromEntries(subsystems.map((s) => [s.id, s.name]))

  const tab = searchParams.tab === 'recent' ? 'recent' : 'needs'
  const needsReceiving = rows.filter((r) => r.receivable && r.outstanding_quantity > 0).sort((a, b) => a.request_title.localeCompare(b.request_title))
  const recentlyReceived = rows
    .filter((r) => r.accepted_quantity > 0 && r.last_received_on)
    .sort((a, b) => (b.last_received_on ?? '').localeCompare(a.last_received_on ?? ''))
    .slice(0, 200)

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Receiving" description="What has arrived, and what is still expected." />

      <div className="mb-5 flex gap-1 border-b border-border">
        {TABS.map((t) => {
          const count = t.id === 'needs' ? needsReceiving.length : recentlyReceived.length
          return (
            <Link
              key={t.id}
              href={t.id === 'needs' ? '/receiving' : '/receiving?tab=recent'}
              className={`border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${tab === t.id ? 'border-ws text-text-primary' : 'border-transparent text-text-muted hover:text-text-primary'}`}
            >
              {t.label} <span className="ml-1 text-text-muted">({count})</span>
            </Link>
          )
        })}
      </div>

      {tab === 'needs' ? (
        <ReceivingTable
          rows={needsReceiving}
          subsystemNames={subsystemNames}
          canReceive={access.canReceiveSubsystem}
          mode="needs"
          emptyTitle="Nothing needs receiving"
          emptyDescription="Every ordered purchase has been fully received, or nothing has been ordered yet."
        />
      ) : (
        <ReceivingTable
          rows={recentlyReceived}
          subsystemNames={subsystemNames}
          canReceive={access.canReceiveSubsystem}
          mode="recent"
          emptyTitle="Nothing received yet"
          emptyDescription="Received purchases will appear here once something is receipted."
        />
      )}
    </div>
  )
}

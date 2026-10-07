import { createClient } from '@/lib/supabase/server'
import { getPartsAccess, listAllPartVendorPairs, listPartsCatalog } from '@/lib/supabase/queries/parts'
import { listSubsystems } from '@/lib/supabase/queries/subsystems'
import { partMatches, summarizeParts } from '@/lib/parts'
import type { Profile } from '@/types/user'
import ErrorState from '@/components/ui/ErrorState'
import PageHeader from '@/components/ui/PageHeader'
import MetricStrip from '@/components/ui/MetricStrip'
import ReadOnlyNotice from '@/components/ui/ReadOnlyNotice'
import PartsFilters from '@/components/parts/PartsFilters'
import PartsTable from '@/components/parts/PartsTable'
import { AddPartButton } from '@/components/parts/PartActions'

export const metadata = { title: 'Parts' }

export default async function PartsPage({ searchParams }: { searchParams: { [key: string]: string | undefined } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  if (!profileRow) return <ErrorState message="Could not load your profile." />
  const profile = profileRow as Profile

  let rows, subsystems, pairs
  try {
    ;[rows, subsystems, pairs] = await Promise.all([listPartsCatalog(supabase), listSubsystems(supabase), listAllPartVendorPairs(supabase)])
  } catch {
    return <ErrorState message="Could not load the parts catalog." />
  }
  const access = await getPartsAccess(supabase, profile)

  // filters (all in the URL)
  const q = searchParams.q ?? ''
  const subsystem = searchParams.subsystem ?? ''
  const vendor = searchParams.vendor ?? ''
  const status = searchParams.status === 'inactive' || searchParams.status === 'all' ? searchParams.status : 'active'
  const partIdsForVendor = vendor ? new Set(pairs.filter((p) => p.vendor_id === vendor).map((p) => p.part_id)) : null
  const filtered = rows.filter((r) => {
    if (status === 'active' && !r.active) return false
    if (status === 'inactive' && r.active) return false
    if (subsystem && r.subsystem_id !== subsystem) return false
    if (partIdsForVendor && !partIdsForVendor.has(r.id)) return false
    return partMatches(r, q)
  })
  const isFiltered = Boolean(q.trim() || subsystem || vendor || status !== 'active')

  const vendorOptions = Array.from(new Map(pairs.filter((p) => p.vendor_name).map((p) => [p.vendor_id, { id: p.vendor_id, name: p.vendor_name as string }])).values()).sort((a, b) => a.name.localeCompare(b.name))
  const subsystemOptions = access.canManageAll ? subsystems : subsystems.filter((s) => access.ledSubsystemIds.includes(s.id))
  const summary = summarizeParts(rows)

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Parts"
        description="Manage the components used across the vehicle."
        actions={
          access.canManageAny ? (
            <AddPartButton subsystemOptions={subsystemOptions.map((s) => ({ id: s.id, name: s.name }))} canMoveSubsystem={access.canManageAll} />
          ) : (
            <ReadOnlyNotice>Read-only: subsystem leads and the CTO manage parts.</ReadOnlyNotice>
          )
        }
      />

      {rows.length > 0 && (
        <MetricStrip
          className="mb-5"
          metrics={[
            { label: 'Total parts', value: String(summary.total) },
            { label: 'Active', value: String(summary.active) },
            { label: 'With a vendor', value: String(summary.withVendor), hint: summary.total > 0 ? `${summary.total - summary.withVendor} without` : undefined },
            { label: 'Missing cost or vendor', value: String(summary.missing), tone: summary.missing > 0 ? 'warning' : 'success', hint: 'Active parts that need attention' },
          ]}
        />
      )}

      <div className="mb-4">
        <PartsFilters subsystems={subsystems.map((s) => ({ id: s.id, name: s.name }))} vendors={vendorOptions} />
      </div>

      <PartsTable rows={filtered} filtered={isFiltered} canAdd={access.canManageAny} />
    </div>
  )
}

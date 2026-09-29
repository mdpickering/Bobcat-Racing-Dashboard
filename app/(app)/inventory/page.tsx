import { createClient } from '@/lib/supabase/server'
import { getInventoryAccess, listInventoryOverview, listLocations } from '@/lib/supabase/queries/inventory'
import { listSubsystems } from '@/lib/supabase/queries/subsystems'
import { inventoryMatches, summarizeInventory } from '@/lib/inventory'
import { formatUsd } from '@/lib/parts'
import type { Profile } from '@/types/user'
import ErrorState from '@/components/ui/ErrorState'
import PageHeader from '@/components/ui/PageHeader'
import MetricStrip from '@/components/ui/MetricStrip'
import InventoryFilters from '@/components/inventory/InventoryFilters'
import InventoryTable from '@/components/inventory/InventoryTable'
import ManageLocationsButton from '@/components/inventory/ManageLocationsButton'

export default async function InventoryPage({ searchParams }: { searchParams: { [key: string]: string | undefined } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  if (!profileRow) return <ErrorState message="Could not load your profile." />
  const profile = profileRow as Profile

  let rows, subsystems, locations
  try {
    ;[rows, subsystems, locations] = await Promise.all([listInventoryOverview(supabase), listSubsystems(supabase), listLocations(supabase)])
  } catch {
    return <ErrorState message="Could not load inventory." />
  }
  const access = await getInventoryAccess(supabase, profile)

  const q = searchParams.q ?? ''
  const subsystem = searchParams.subsystem ?? ''
  const location = searchParams.location ?? ''
  const status = searchParams.status === 'inactive' || searchParams.status === 'all' ? searchParams.status : 'active'
  const filtered = rows.filter((r) => {
    if (status === 'active' && !r.active) return false
    if (status === 'inactive' && r.active) return false
    if (subsystem && r.subsystem_id !== subsystem) return false
    if (location && !r.location_names.split(', ').includes(locations.find((l) => l.id === location)?.name ?? '\0')) return false
    return inventoryMatches(r, q)
  })
  const isFiltered = Boolean(q.trim() || subsystem || location || status !== 'active')
  const activeLocations = locations.filter((l) => l.active)
  const summary = summarizeInventory(rows)

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Inventory"
        description="What parts the team physically has, and where."
        actions={access.canManageLocations ? <ManageLocationsButton locations={locations} /> : undefined}
      />

      {locations.length === 0 ? (
        <div className="mb-5 rounded-xl border border-dashed border-border px-5 py-4 text-xs text-text-secondary">
          <p className="font-semibold text-text-primary">No locations exist yet.</p>
          <p className="mt-1">
            {access.canManageLocations
              ? 'Add the team’s real locations (Shop, Trailer, Team Storage, …) with the button above before receiving or recording stock.'
              : 'An Admin, CTO or the COO adds the team’s locations before stock can be tracked here.'}
          </p>
        </div>
      ) : (
        rows.length > 0 && (
          <MetricStrip
            className="mb-5"
            metrics={[
              { label: 'Locations', value: String(activeLocations.length) },
              { label: 'Parts with stock', value: String(summary.partsTracked) },
              { label: 'Units on hand', value: String(summary.totalOnHand) },
              { label: 'Stock value', value: formatUsd(summary.totalValue), hint: summary.missingCostCount > 0 ? `${summary.missingCostCount} part${summary.missingCostCount === 1 ? '' : 's'} with no cost excluded` : undefined },
            ]}
          />
        )
      )}

      <div className="mb-4">
        <InventoryFilters subsystems={subsystems.map((s) => ({ id: s.id, name: s.name }))} locations={activeLocations.map((l) => ({ id: l.id, name: l.name }))} />
      </div>

      <InventoryTable rows={filtered} filtered={isFiltered} hasLocations={locations.length > 0} />
    </div>
  )
}

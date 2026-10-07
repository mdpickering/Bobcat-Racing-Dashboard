import { createClient } from '@/lib/supabase/server'
import { getVendorAccess, listVendorsOverview } from '@/lib/supabase/queries/vendors'
import { vendorMatches, formatUsd } from '@/lib/parts'
import type { Profile } from '@/types/user'
import ErrorState, { PermissionDeniedState } from '@/components/ui/ErrorState'
import PageHeader from '@/components/ui/PageHeader'
import MetricStrip from '@/components/ui/MetricStrip'
import ReadOnlyNotice from '@/components/ui/ReadOnlyNotice'
import VendorFilters from '@/components/vendors/VendorFilters'
import VendorsTable from '@/components/vendors/VendorsTable'
import { AddVendorButton } from '@/components/vendors/VendorFormModal'

export const metadata = { title: 'Vendors' }

export default async function VendorsPage({ searchParams }: { searchParams: { [key: string]: string | undefined } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  if (!profileRow) return <ErrorState message="Could not load your profile." />
  const profile = profileRow as Profile

  const access = await getVendorAccess(supabase, profile)
  if (!access.canView) return <PermissionDeniedState message="The Business area is limited to the Business team, the COO, the CTO and Admin accounts." />

  let rows
  try {
    rows = await listVendorsOverview(supabase)
  } catch {
    return <ErrorState message="Could not load vendors." />
  }

  const q = searchParams.q ?? ''
  const status = searchParams.status === 'inactive' || searchParams.status === 'all' ? searchParams.status : 'active'
  const filtered = rows.filter((r) => {
    if (status === 'active' && !r.active) return false
    if (status === 'inactive' && r.active) return false
    return vendorMatches(r, q)
  })
  const isFiltered = Boolean(q.trim() || status !== 'active')
  const active = rows.filter((r) => r.active)
  const withParts = rows.filter((r) => r.part_count > 0).length
  const purchased = rows.reduce((sum, r) => sum + r.purchase_total, 0)

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Vendors"
        description="Suppliers the team buys from, their contacts, and the parts each one sells."
        back={{ label: 'Back to Business', href: '/business' }}
        actions={access.canManage ? <AddVendorButton /> : <ReadOnlyNotice>Read-only: Business team members and admins manage vendors.</ReadOnlyNotice>}
      />

      {rows.length > 0 && (
        <MetricStrip
          className="mb-5"
          metrics={[
            { label: 'Vendors', value: String(rows.length) },
            { label: 'Active', value: String(active.length) },
            { label: 'With parts', value: String(withParts) },
            ...(purchased > 0 ? [{ label: 'Purchased from linked vendors', value: formatUsd(purchased), hint: 'Submitted orders only' }] : []),
          ]}
        />
      )}

      <div className="mb-4">
        <VendorFilters />
      </div>

      <VendorsTable rows={filtered} filtered={isFiltered} canAdd={access.canManage} />
    </div>
  )
}

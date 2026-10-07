import { notFound } from 'next/navigation'
import { ExternalLink, Mail, MapPin, Phone } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getVendorAccess, getVendorOverview, listVendorParts, listVendorPurchaseLines } from '@/lib/supabase/queries/vendors'
import { listCatalogAudit } from '@/lib/supabase/queries/parts'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import { formatUsd } from '@/lib/parts'
import type { Profile } from '@/types/user'
import ErrorState, { PermissionDeniedState } from '@/components/ui/ErrorState'
import PageHeader from '@/components/ui/PageHeader'
import Panel from '@/components/ui/Panel'
import MetricStrip from '@/components/ui/MetricStrip'
import ReadOnlyNotice from '@/components/ui/ReadOnlyNotice'
import { CatalogStatusBadge } from '@/components/parts/PartsTable'
import { EditVendorButton } from '@/components/vendors/VendorFormModal'
import VendorPartsPanel from '@/components/vendors/VendorPartsPanel'
import RelatedPurchasesPanel from '@/components/parts/RelatedPurchasesPanel'
import CatalogAuditPanel from '@/components/parts/CatalogAuditPanel'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function VendorDetailPage({ params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) notFound()
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  if (!profileRow) return <ErrorState message="Could not load your profile." />
  const profile = profileRow as Profile

  const access = await getVendorAccess(supabase, profile)
  if (!access.canView) return <PermissionDeniedState message="The Business area is limited to the Business team, the COO, the CTO and Admin accounts." />

  let vendor
  try {
    vendor = await getVendorOverview(supabase, params.id)
  } catch {
    return <ErrorState message="Could not load this vendor." />
  }
  if (!vendor) notFound()

  const admin = isCtoOrAdmin(profile)
  const [links, lines, audit] = await Promise.all([
    listVendorParts(supabase, vendor.id).catch(() => []),
    listVendorPurchaseLines(supabase, vendor.id).catch(() => []),
    admin ? listCatalogAudit(supabase, ['vendor'], vendor.id).catch(() => []) : Promise.resolve([]),
  ])

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={vendor.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <CatalogStatusBadge active={vendor.active} />
            {vendor.website && (
              <a href={vendor.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-accent-blue">
                {vendor.website.replace(/^https?:\/\//, '')} <ExternalLink size={11} aria-hidden="true" />
              </a>
            )}
          </span>
        }
        back={{ label: 'Back to vendors', href: '/business/vendors' }}
        actions={access.canManage ? <EditVendorButton vendor={vendor} /> : undefined}
      >
        {!access.canManage && <ReadOnlyNotice>You can view this vendor. Business team members and admins change it.</ReadOnlyNotice>}
      </PageHeader>

      <MetricStrip
        className="mb-5"
        metrics={[
          { label: 'Parts', value: String(vendor.part_count), hint: 'Active parts linked' },
          { label: 'Purchase lines', value: String(vendor.purchase_items), hint: vendor.purchase_items > 0 ? 'On submitted orders' : 'None linked yet' },
          ...(vendor.purchase_items > 0 ? [{ label: 'Purchased', value: formatUsd(vendor.purchase_total) }] : []),
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <VendorPartsPanel links={links} />
          <RelatedPurchasesPanel title="Purchasing activity" lines={lines} />
          {admin && <CatalogAuditPanel entries={audit} />}
        </div>

        <aside className="space-y-4 lg:col-start-2 lg:row-start-1 lg:self-start">
          <Panel className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-text-primary">Contact</h2>
            {vendor.contact_name || vendor.contact_email || vendor.contact_phone || vendor.address ? (
              <ul className="space-y-2 text-xs text-text-secondary">
                {vendor.contact_name && <li className="font-medium text-text-primary">{vendor.contact_name}</li>}
                {vendor.contact_email && (
                  <li className="flex items-start gap-1.5 break-all">
                    <Mail size={12} className="mt-0.5 flex-shrink-0 text-text-muted" aria-hidden="true" />
                    <a href={`mailto:${vendor.contact_email}`} className="text-accent-blue hover:underline">
                      {vendor.contact_email}
                    </a>
                  </li>
                )}
                {vendor.contact_phone && (
                  <li className="flex items-start gap-1.5">
                    <Phone size={12} className="mt-0.5 flex-shrink-0 text-text-muted" aria-hidden="true" />
                    {vendor.contact_phone}
                  </li>
                )}
                {vendor.address && (
                  <li className="flex items-start gap-1.5 whitespace-pre-wrap">
                    <MapPin size={12} className="mt-0.5 flex-shrink-0 text-text-muted" aria-hidden="true" />
                    {vendor.address}
                  </li>
                )}
              </ul>
            ) : (
              <p className="text-[12px] text-text-muted">No contact details recorded.</p>
            )}
            <p className="mt-3 text-2xs text-text-muted">Visible to every signed-in team member, so engineers can order.</p>
          </Panel>

          {vendor.notes && (
            <Panel className="p-4">
              <h2 className="mb-2 text-sm font-semibold text-text-primary">Notes</h2>
              <p className="whitespace-pre-wrap text-xs text-text-secondary">{vendor.notes}</p>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  )
}

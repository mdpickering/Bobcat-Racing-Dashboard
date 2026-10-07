import { notFound } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getPartCatalogRow, getPartsAccess, listActiveVendors, listCatalogAudit, listPartPurchaseLines, listPartVendors } from '@/lib/supabase/queries/parts'
import { listSubsystems } from '@/lib/supabase/queries/subsystems'
import { getBusinessAccess } from '@/lib/supabase/queries/business'
import { getInventoryAccess, getInventoryOverviewForPart, listActiveLocations, listInventoryByLocationForPart, listRecentTransactionsForPart } from '@/lib/supabase/queries/inventory'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import { formatUsd } from '@/lib/parts'
import { formatDate } from '@/lib/format'
import type { Profile } from '@/types/user'
import ErrorState from '@/components/ui/ErrorState'
import PageHeader from '@/components/ui/PageHeader'
import Panel from '@/components/ui/Panel'
import ReadOnlyNotice from '@/components/ui/ReadOnlyNotice'
import { CatalogStatusBadge } from '@/components/parts/PartsTable'
import { EditPartButton } from '@/components/parts/PartActions'
import PartVendorsPanel from '@/components/parts/PartVendorsPanel'
import RelatedPurchasesPanel from '@/components/parts/RelatedPurchasesPanel'
import CatalogAuditPanel from '@/components/parts/CatalogAuditPanel'
import PartStockPanel from '@/components/parts/PartStockPanel'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <dt className="text-2xs font-medium text-text-muted">{label}</dt>
    <dd className="mt-1 text-xs text-text-primary">{children}</dd>
  </div>
)
const dash = <span className="text-text-muted">—</span>

export default async function PartDetailPage({ params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) notFound()
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  if (!profileRow) return <ErrorState message="Could not load your profile." />
  const profile = profileRow as Profile

  let part
  try {
    part = await getPartCatalogRow(supabase, params.id)
  } catch {
    return <ErrorState message="Could not load this part." />
  }
  if (!part) notFound()

  const admin = isCtoOrAdmin(profile)
  const [access, business, inventoryAccess, subsystems, links, lines, vendors, audit, stockOverview, stockByLocation, activeLocations, recentTransactions] = await Promise.all([
    getPartsAccess(supabase, profile),
    getBusinessAccess(supabase, profile),
    getInventoryAccess(supabase, profile),
    listSubsystems(supabase),
    listPartVendors(supabase, part.id).catch(() => []),
    listPartPurchaseLines(supabase, part.id).catch(() => []),
    listActiveVendors(supabase).catch(() => []),
    admin ? listCatalogAudit(supabase, ['part', 'part_vendor'], part.id).catch(() => []) : Promise.resolve([]),
    getInventoryOverviewForPart(supabase, part.id).catch(() => null),
    listInventoryByLocationForPart(supabase, part.id).catch(() => []),
    listActiveLocations(supabase).catch(() => []),
    listRecentTransactionsForPart(supabase, part.id).catch(() => []),
  ])
  const canManage = access.canManageSubsystem(part.subsystem_id)
  const linkedIds = new Set(links.map((l) => l.vendor_id))
  const available = vendors.filter((v) => !linkedIds.has(v.id)).map((v) => ({ id: v.id, name: v.name }))
  const subsystemOptions = (access.canManageAll ? subsystems : subsystems.filter((s) => access.ledSubsystemIds.includes(s.id))).map((s) => ({ id: s.id, name: s.name }))
  const preferred = links.find((l) => l.is_preferred) ?? null

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`${part.part_number} · ${part.name}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            {part.subsystem_name}
            {part.category && <span>· {part.category}</span>}
            <CatalogStatusBadge active={part.active} />
          </span>
        }
        back={{ label: 'Back to parts', href: '/parts' }}
        actions={canManage ? <EditPartButton part={part} subsystemOptions={subsystemOptions} canMoveSubsystem={access.canManageAll} /> : undefined}
      >
        {!canManage && (
          <ReadOnlyNotice>
            You can view this part. The lead of {part.subsystem_name}, the CTO or an admin changes it.
          </ReadOnlyNotice>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <PartStockPanel
            partId={part.id}
            partLabel={`${part.part_number} · ${part.name}`}
            overview={stockOverview}
            byLocation={stockByLocation}
            transactions={recentTransactions}
            activeLocations={activeLocations}
            canAdjust={inventoryAccess.canAdjustSubsystem(part.subsystem_id)}
            canManageInventory={inventoryAccess.canManageLocations}
          />
          <PartVendorsPanel partId={part.id} links={links} availableVendors={available} canManage={canManage} canOpenVendors={business.canView} />
          <RelatedPurchasesPanel title="Purchasing activity" lines={lines} />
          {admin && <CatalogAuditPanel entries={audit} />}
        </div>

        <aside className="space-y-4 lg:row-start-1 lg:col-start-2 lg:sticky lg:top-0 lg:self-start">
          <Panel className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-text-primary">What we order</h2>
            <dl className="space-y-3">
              <Field label="Unit cost">
                {part.missing_cost ? <span className="text-status-warning">Not recorded</span> : <span className="text-base font-semibold tabular-nums">{formatUsd(part.effective_unit_cost)}</span>}
                {!part.missing_cost && preferred?.unit_cost != null && <span className="ml-1 text-2xs text-text-muted">from {preferred.vendor?.name ?? 'the preferred vendor'}</span>}
              </Field>
              <Field label="Preferred vendor">{part.preferred_vendor_name ?? (part.vendor_count > 0 ? <span className="text-text-muted">None chosen ({part.vendor_count} linked)</span> : dash)}</Field>
              <Field label="Order this number">
                {preferred?.vendor_part_number ? <span className="font-mono text-[12px]">{preferred.vendor_part_number}</span> : part.manufacturer_part_number ? <span className="font-mono text-[12px]">{part.manufacturer_part_number}</span> : dash}
              </Field>
            </dl>
          </Panel>

          <Panel className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-text-primary">Part details</h2>
            <dl className="space-y-3">
              <Field label="Manufacturer">{part.manufacturer ?? dash}</Field>
              <Field label="Manufacturer part number">{part.manufacturer_part_number ? <span className="font-mono text-[12px]">{part.manufacturer_part_number}</span> : dash}</Field>
              <Field label="Reference cost">{part.unit_cost !== null ? formatUsd(part.unit_cost) : dash}</Field>
              <Field label="Source link">
                {part.source_url ? (
                  <a href={part.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-accent-blue hover:underline">
                    {part.source_url.replace(/^https?:\/\//, '').slice(0, 48)} <ExternalLink size={11} aria-hidden="true" />
                  </a>
                ) : (
                  dash
                )}
              </Field>
              {part.description && <Field label="Description"><span className="whitespace-pre-wrap text-text-secondary">{part.description}</span></Field>}
              {part.notes && <Field label="Notes"><span className="whitespace-pre-wrap text-text-secondary">{part.notes}</span></Field>}
              <Field label="Updated">{formatDate(part.updated_at)}</Field>
            </dl>
          </Panel>
        </aside>
      </div>
    </div>
  )
}

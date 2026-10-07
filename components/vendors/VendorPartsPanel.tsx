import Link from 'next/link'
import { Cog, ExternalLink, Star } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Badge from '@/components/ui/Badge'
import { formatUsd } from '@/lib/parts'
import type { PartVendorLink } from '@/types/database'

// The parts this vendor sells, with the vendor-specific order number, price and product link. Read-only here: the
// links are maintained on each part (by the lead of its subsystem). Part pages are shared, so the link always works.
export default function VendorPartsPanel({ links }: { links: PartVendorLink[] }) {
  return (
    <Panel className="p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-text-primary">
        <Cog size={13} className="text-accent-blue" /> Parts from this vendor <span className="text-xs font-normal text-text-muted">{links.length}</span>
      </h2>
      {links.length === 0 ? (
        <p className="text-[12px] text-text-muted">No parts are linked to this vendor yet. Subsystem leads link vendors to parts on each part&apos;s page.</p>
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead>
              <tr className="border-b border-border text-2xs font-medium text-text-muted">
                <th scope="col" className="py-2 pr-2 font-medium">Part</th>
                <th scope="col" className="px-2 py-2 font-medium">Vendor order #</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Unit cost</th>
                <th scope="col" className="py-2 pl-2 font-medium">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {links.map((l) => (
                <tr key={l.part_id} className={l.part && !l.part.active ? 'opacity-60' : ''}>
                  <td className="py-2.5 pr-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/parts/${l.part_id}`} className="font-medium text-text-primary hover:text-accent-blue">
                        <span className="font-mono text-[12px]">{l.part?.part_number}</span> · {l.part?.name}
                      </Link>
                      {l.is_preferred && (
                        <Badge tone="gold">
                          <span className="inline-flex items-center gap-1">
                            <Star size={10} aria-hidden="true" /> Preferred
                          </span>
                        </Badge>
                      )}
                      {l.part && !l.part.active && <Badge tone="slate">Inactive</Badge>}
                    </div>
                    {l.availability_notes && <div className="mt-0.5 text-2xs text-text-muted">{l.availability_notes}</div>}
                  </td>
                  <td className="px-2 py-2.5 font-mono text-[12px] text-text-secondary">{l.vendor_part_number ?? '—'}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-text-primary">{formatUsd(l.unit_cost)}</td>
                  <td className="py-2.5 pl-2">
                    {l.product_url ? (
                      <a href={l.product_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-blue hover:underline">
                        Open <ExternalLink size={11} aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

import { History } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { formatDateTime } from '@/lib/format'
import type { CatalogAuditEntry } from '@/lib/supabase/queries/parts'

const ACTION_LABEL: Record<string, string> = {
  'part.created': 'Part added',
  'part.updated': 'Part edited',
  'part.deactivated': 'Part deactivated',
  'part.reactivated': 'Part reactivated',
  'part_vendor.created': 'Vendor linked',
  'part_vendor.updated': 'Vendor link edited',
  'part_vendor.removed': 'Vendor unlinked',
  'vendor.created': 'Vendor added',
  'vendor.updated': 'Vendor edited',
  'vendor.deactivated': 'Vendor deactivated',
  'vendor.reactivated': 'Vendor reactivated',
}

const HIDDEN = new Set(['id', 'created_at', 'created_by', 'name_key', 'part_number_key', 'updated_at'])

function summarize(entry: CatalogAuditEntry): string {
  const after = entry.after ?? {}
  const before = entry.before ?? {}
  if (entry.action.endsWith('.created') || entry.action.endsWith('.removed')) return ''
  return Object.keys(after)
    .filter((k) => !HIDDEN.has(k) && k !== 'vendor_id')
    .slice(0, 4)
    .map((k) => `${k.replace(/_/g, ' ')}: ${String(before[k] ?? '—')} → ${String(after[k] ?? '—')}`)
    .join('; ')
}

// Who changed what. Only the CTO and admins can read the audit log (migration 0011), so this panel is only shown to them.
export default function CatalogAuditPanel({ entries }: { entries: CatalogAuditEntry[] }) {
  return (
    <Panel className="p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-text-primary">
        <History size={13} className="text-accent-blue" /> Change history <span className="text-2xs font-normal text-text-muted">(admins only)</span>
      </h2>
      {entries.length === 0 ? (
        <p className="text-[12px] text-text-muted">No changes recorded yet.</p>
      ) : (
        <ul className="divide-y divide-border text-xs">
          {entries.map((e) => (
            <li key={e.id} className="py-2 first:pt-0 last:pb-0">
              <div className="font-medium text-text-primary">{ACTION_LABEL[e.action] ?? e.action}</div>
              {summarize(e) && <div className="mt-0.5 break-words text-2xs text-text-secondary">{summarize(e)}</div>}
              <div className="mt-0.5 text-2xs text-text-muted">
                {formatDateTime(e.created_at)} · {e.actor?.display_name || e.actor?.email || 'system'}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

import Link from 'next/link'
import { ArrowRight, ShoppingCart, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getBusinessAccess } from '@/lib/supabase/queries/business'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import type { Profile } from '@/types/user'
import Panel from '@/components/ui/Panel'
import Badge from '@/components/ui/Badge'
import ErrorState, { PermissionDeniedState } from '@/components/ui/ErrorState'

const SECTIONS = [
  { href: '/business/team', label: 'Team', description: 'Who is on the Business team, who leads it, and who is the Sponsorship Lead.', icon: Users },
  { href: '/purchasing', label: 'Purchasing', description: "The team's purchase orders and the purchase sheet exports.", icon: ShoppingCart },
]

// The Business home. Sections are added here as each Business feature ships; only what exists is listed.
export default async function BusinessPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  if (!profileRow) return <ErrorState message="Could not load your profile." />
  const profile = profileRow as Profile

  const access = await getBusinessAccess(supabase, profile)
  if (!access.canView) return <PermissionDeniedState message="The Business area is limited to the Business team, the COO, the CTO and Admin accounts." />

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Business</h1>
        <p className="mt-0.5 text-xs font-mono text-text-muted">The business side of the team.</p>
      </div>

      <Panel className="p-4">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-text-primary">Your access</h2>
        <div className="flex flex-wrap items-center gap-2">
          {access.isLead && <Badge tone="gold">Business Lead</Badge>}
          {access.responsibilities.includes('sponsorship_lead') && <Badge tone="sky">Sponsorship Lead</Badge>}
          {access.isMember && !access.isLead && <Badge tone="slate">Business Member</Badge>}
          {!access.isMember && isCtoOrAdmin(profile) && <Badge tone="gold">Full access ({profile.role})</Badge>}
          {!access.isMember && !isCtoOrAdmin(profile) && <Badge tone="amber">Read-only</Badge>}
        </div>
        {!access.isMember && !isCtoOrAdmin(profile) && (
          <p className="mt-2 text-[11px] text-text-muted">You can see the Business area. To make changes you need to be added to the Business team.</p>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SECTIONS.map(({ href, label, description, icon: Icon }) => (
          <Link key={href} href={href}>
            <Panel className="flex h-full items-start gap-3 p-4 transition-colors hover:border-accent-blue/40">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent-blue/10 text-accent-blue">
                <Icon size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-sm font-semibold text-text-primary">
                  {label} <ArrowRight size={13} className="text-text-muted" />
                </div>
                <p className="mt-1 text-[11px] text-text-muted">{description}</p>
              </div>
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  )
}

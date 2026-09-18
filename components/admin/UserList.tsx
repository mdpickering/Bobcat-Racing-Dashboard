import Link from 'next/link'
import { Users } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Badge from '@/components/ui/Badge'
import Avatar from '@/components/ui/Avatar'
import EmptyState from '@/components/ui/EmptyState'
import type { Profile } from '@/types/user'

const ROLE_TONE: Record<string, 'gold' | 'slate' | 'sky'> = {
  admin: 'gold',
  cto: 'gold',
  team_lead: 'sky',
  member: 'slate',
}

export default function UserList({ users }: { users: Profile[] }) {
  if (users.length === 0) {
    return <EmptyState icon={Users} title="No users match these filters" description="Try adjusting or clearing your filters." />
  }

  return (
    <Panel className="overflow-hidden">
      <ul className="divide-y divide-border">
        {users.map((u) => (
          <li key={u.id}>
            <Link href={`/admin/users/${u.id}`} className="flex items-center gap-3 px-4 py-3 text-xs transition-colors hover:bg-surface-raised">
              <Avatar name={u.display_name || u.email} src={u.avatar_url} size={28} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-text-primary">{u.display_name || 'Unnamed'}</div>
                <div className="truncate text-[10px] text-text-muted">{u.email}</div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                {!u.approved && <Badge tone="amber">Pending</Badge>}
                {!u.active && <Badge tone="rose">Inactive</Badge>}
                <Badge tone={ROLE_TONE[u.role] ?? 'slate'}>{u.role.replace('_', ' ')}</Badge>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

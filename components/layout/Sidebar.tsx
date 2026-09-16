import type { Profile } from '@/types/user'

interface SidebarProps {
  profile: Profile
}

export default function Sidebar({ profile }: SidebarProps) {
  return (
    <aside className="w-64 flex-shrink-0 bg-qu-surface/90 border-r border-white/10 flex flex-col justify-between h-screen">
      <div>
        <div className="h-16 flex items-center px-5 border-b border-white/10">
          <span className="text-sm font-bold tracking-wide">BOBCAT RACING</span>
        </div>
        <nav className="p-4 space-y-1 text-xs font-mono text-slate-400">
          <div className="px-2 py-2 rounded-lg bg-white/5 text-slate-200">
            Dashboard
          </div>
          <div className="px-2 py-2 text-slate-500">
            More sections arrive in later phases
          </div>
        </nav>
      </div>
      <div className="p-4 border-t border-white/10 text-[11px] font-mono text-slate-400">
        Signed in as
        <div className="text-slate-200 font-semibold truncate">
          {profile.display_name || profile.email}
        </div>
        <div className="text-qu-gold uppercase text-[10px] mt-1">
          {profile.role}
        </div>
      </div>
    </aside>
  )
}

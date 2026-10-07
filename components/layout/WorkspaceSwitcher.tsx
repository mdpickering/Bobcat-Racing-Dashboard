'use client'

import { useRouter } from 'next/navigation'
import { Check, ChevronDown } from 'lucide-react'
import Menu from '@/components/ui/Menu'
import { WORKSPACES } from '@/lib/workspaces'
import { rememberWorkspace } from '@/lib/workspacePreference'
import type { WorkspaceId } from '@/lib/workspaceAccess'

interface WorkspaceSwitcherProps {
  current: WorkspaceId
  available: WorkspaceId[]
  // 'sidebar': full-width control at the top of the sidebar (icon-only in the collapsed rail).
  // 'header': compact chip for phones, where the sidebar is a drawer.
  variant: 'sidebar' | 'header'
  railMode?: boolean
  onSwitched?: () => void
}

// THE workspace switcher — there is exactly one on screen: in the sidebar on desktop, in the header on phones.
// It only offers workspaces the server said are available; that is navigation, not authorization, and every page
// still enforces its own access.
export default function WorkspaceSwitcher({ current, available, variant, railMode = false, onSwitched }: WorkspaceSwitcherProps) {
  const router = useRouter()
  const def = WORKSPACES[current]
  const canSwitch = available.length > 1

  const face = (
    <>
      <span className="h-2 w-2 flex-shrink-0 rounded-sm bg-ws" aria-hidden="true" />
      <span className={`${variant === 'sidebar' ? 'sidebar-label' : ''} flex-1 truncate text-left text-xs font-semibold uppercase tracking-wider text-text-primary`}>{def.label}</span>
      {canSwitch && <ChevronDown size={14} className={`${variant === 'sidebar' ? 'sidebar-label' : ''} flex-shrink-0 text-text-muted`} aria-hidden="true" />}
    </>
  )

  const faceClass =
    variant === 'sidebar'
      ? 'sidebar-switcher flex w-full items-center gap-2.5 overflow-hidden rounded-lg border border-border bg-surface-raised px-3 py-2 transition-colors hover:border-ws/60'
      : 'flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-2 py-1.5 transition-colors hover:border-ws/60'

  if (!canSwitch) {
    return (
      <div className={faceClass} aria-label={`Workspace: ${def.label}`}>
        {face}
      </div>
    )
  }

  return (
    <Menu
      label="Switch workspace"
      placement={railMode ? 'right-start' : 'bottom-start'}
      panelClassName="w-64"
      trigger={({ triggerProps }) => (
        <button type="button" {...triggerProps} aria-label={`Workspace: ${def.label}. Switch workspace`} title={railMode ? def.label : undefined} className={faceClass}>
          {face}
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="px-2.5 pb-1.5 pt-1 text-2xs font-medium text-text-muted">Workspace</div>
          {available.map((id) => {
            const w = WORKSPACES[id]
            const active = id === current
            return (
              <button
                key={id}
                type="button"
                role="menuitem"
                aria-current={active ? 'true' : undefined}
                onClick={() => {
                  close()
                  rememberWorkspace(id)
                  onSwitched?.()
                  router.push(w.home)
                }}
                className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface focus:bg-surface ${active ? 'bg-surface' : ''}`}
              >
                <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-sm" style={{ backgroundColor: `rgb(${ACCENT_PREVIEW[id]})` }} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-text-primary">{w.label}</span>
                  <span className="block text-xs text-text-secondary">{w.description}</span>
                </span>
                {active && <Check size={14} className="mt-0.5 flex-shrink-0 text-text-primary" aria-hidden="true" />}
              </button>
            )
          })}
        </>
      )}
    </Menu>
  )
}

// Each option shows ITS workspace's accent even though the shell only carries the current one.
const ACCENT_PREVIEW: Record<WorkspaceId, string> = {
  engineering: '122 147 168',
  business: '255 199 44',
  operations: '62 124 177',
}

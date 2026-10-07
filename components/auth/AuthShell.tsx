import type { ReactNode } from 'react'

interface AuthShellProps {
  title: string
  description?: ReactNode
  icon?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

// The one frame for every signed-out page (sign in, join, pending approval, deactivated): the brand lockup with the
// gold glow, then a single rounded card. Colours come from the same theme tokens as the app, so it follows light/dark.
export default function AuthShell({ title, description, icon, children, footer }: AuthShellProps) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 py-10"
      style={{ backgroundImage: 'radial-gradient(700px 320px at 50% -8%, rgb(var(--accent) / 0.14), transparent 70%)' }}
    >
      <div className="mb-6 flex items-center gap-3">
        <div className="relative flex-shrink-0">
          <div className="absolute inset-0 rounded-xl bg-qu-gold/40 blur-md" aria-hidden="true" />
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-qu-gold text-lg font-black text-qu-navy">B</div>
        </div>
        <div>
          <div className="text-sm font-bold leading-4 tracking-wide text-text-primary">BOBCAT RACING</div>
          <div className="mt-0.5 text-2xs leading-4 tracking-[0.14em] text-text-muted">BAJA SAE WORKSPACE</div>
        </div>
      </div>

      <main className="w-full max-w-md rounded-3xl border border-border bg-surface p-6 shadow-panel md:p-8">
        {icon && <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 text-accent">{icon}</div>}
        <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
        {description && <p className="mt-1.5 text-xs leading-5 text-text-secondary">{description}</p>}
        <div className="mt-6">{children}</div>
      </main>

      {footer && <p className="mt-5 text-xs text-text-secondary">{footer}</p>}
    </div>
  )
}

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

interface PageHeaderProps {
  title: string
  // one line saying what the page is for
  description?: React.ReactNode
  back?: { label: string; href: string }
  actions?: React.ReactNode
  // e.g. <Tabs/> or a filter row shown under the title
  children?: React.ReactNode
}

// The one page heading for every workspace: a short workspace-accent rule, a 20px title, a 13px purpose line, and
// the page's primary actions on the right (stacking below on phones).
export default function PageHeader({ title, description, back, actions, children }: PageHeaderProps) {
  return (
    <header className="mb-5">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-text-primary">
          <ChevronLeft size={14} aria-hidden="true" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <div className="mb-2 h-0.5 w-8 rounded-full bg-ws" aria-hidden="true" />
          <h1 className="text-xl font-semibold leading-7 text-text-primary">{title}</h1>
          {description && <p className="mt-0.5 max-w-2xl text-[13px] leading-5 text-text-secondary">{description}</p>}
        </div>
        {actions && <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </header>
  )
}

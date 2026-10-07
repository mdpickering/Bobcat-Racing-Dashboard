import Link from 'next/link'
import { SearchX } from 'lucide-react'
import AuthShell from '@/components/auth/AuthShell'

export const metadata = { title: 'Page not found' }

export default function NotFound() {
  return (
    <AuthShell
      title="Page not found"
      icon={<SearchX size={20} aria-hidden="true" />}
      description="That page doesn't exist, or it was moved. Check the address, or head back to the app."
    >
      <Link
        href="/"
        className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-qu-gold px-4 py-2 text-xs font-bold text-qu-navy shadow-glow transition-colors hover:bg-qu-goldHover"
      >
        Go to the dashboard
      </Link>
    </AuthShell>
  )
}

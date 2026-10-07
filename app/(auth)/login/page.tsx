'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import Panel from '@/components/ui/Panel'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <Panel className="w-full max-w-sm p-6">
        <h1 className="text-sm font-bold mb-4">Bobcat Racing — Sign In</h1>
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block mb-1 text-xs text-text-secondary">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-bg p-2 text-xs text-text-primary outline-none transition-colors focus:border-accent-blue"
            />
          </div>
          <div>
            <label className="block mb-1 text-xs text-text-secondary">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-bg p-2 text-xs text-text-primary outline-none transition-colors focus:border-accent-blue"
            />
          </div>
          {error && <p className="text-status-danger">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Signing In…' : 'Sign In'}
          </Button>
        </form>
        <p className="text-[12px] text-text-secondary mt-4">
          Need an account?{' '}
          <Link href="/signup" className="text-accent hover:underline">
            Join the team
          </Link>
        </p>
      </Panel>
    </div>
  )
}

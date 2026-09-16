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

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-qu-obsidian px-4">
      <Panel className="w-full max-w-sm p-6">
        <h1 className="text-sm font-bold mb-4">Bobcat Racing — Sign In</h1>
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block mb-1 font-mono uppercase text-[10px] text-slate-400">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-black/40 border border-white/15 rounded-lg p-2 text-slate-100 outline-none"
            />
          </div>
          <div>
            <label className="block mb-1 font-mono uppercase text-[10px] text-slate-400">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black/40 border border-white/15 rounded-lg p-2 text-slate-100 outline-none"
            />
          </div>
          {error && <p className="text-rose-400">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Signing In…' : 'Sign In'}
          </Button>
        </form>
        <p className="text-[11px] text-slate-400 mt-4">
          Need an account?{' '}
          <Link href="/signup" className="text-qu-gold hover:underline">
            Join the team
          </Link>
        </p>
      </Panel>
    </div>
  )
}

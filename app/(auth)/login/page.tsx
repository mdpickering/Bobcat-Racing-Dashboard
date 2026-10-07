'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import AuthShell from '@/components/auth/AuthShell'

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
    <AuthShell
      title="Sign in"
      description="Welcome back. Sign in to the team workspace."
      footer={
        <>
          Need an account?{' '}
          <Link href="/signup" className="font-medium text-accent hover:underline">
            Join the team
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div>
          <label htmlFor="login-email" className="mb-1.5 block font-medium text-text-secondary">
            Email
          </label>
          <Input id="login-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl !bg-bg py-2.5" />
        </div>
        <div>
          <label htmlFor="login-password" className="mb-1.5 block font-medium text-text-secondary">
            Password
          </label>
          <Input id="login-password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-xl !bg-bg py-2.5" />
        </div>
        {error && (
          <p role="alert" className="text-status-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={loading} className="w-full rounded-xl py-2.5 active:scale-[0.98]">
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  )
}

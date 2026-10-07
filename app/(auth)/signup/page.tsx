'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import Panel from '@/components/ui/Panel'

const YEAR_OPTIONS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate']

export default function SignupPage() {
  const supabase = createClient()
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [year, setYear] = useState(YEAR_OPTIONS[0])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          year,
        },
      },
    })

    if (error) {
      setLoading(false)
      setError(error.message)
      return
    }

    // With "Confirm email" off in Supabase the account is confirmed immediately and comes back
    // signed in, so there is no email to wait for. Only when confirmation is required is there
    // no session yet, and only then do we tell the user to check their inbox.
    if (data.session) {
      router.push('/')
      router.refresh()
      return
    }

    setLoading(false)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-4">
        <Panel className="w-full max-w-sm p-6 text-xs text-text-secondary">
          <h1 className="text-sm font-bold mb-2 text-text-primary">
            Check your email
          </h1>
          <p>
            We sent a confirmation link to <strong>{email}</strong>. Confirm
            your account, then{' '}
            <Link href="/login" className="text-accent hover:underline">
              log in
            </Link>
            .
          </p>
        </Panel>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <Panel className="w-full max-w-sm p-6">
        <h1 className="text-sm font-bold mb-4">Join Bobcat Racing</h1>
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block mb-1 text-xs text-text-secondary">
              Name
            </label>
            <input
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg border border-border bg-bg p-2 text-xs text-text-primary outline-none transition-colors focus:border-accent-blue"
            />
          </div>
          <div>
            <label className="block mb-1 text-xs text-text-secondary">
              Academic Year
            </label>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-full rounded-lg border border-border bg-bg p-2 text-xs text-text-primary outline-none transition-colors focus:border-accent-blue"
            >
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
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
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-bg p-2 text-xs text-text-primary outline-none transition-colors focus:border-accent-blue"
            />
          </div>
          {error && <p className="text-status-danger">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Creating Account…' : 'Create Account'}
          </Button>
        </form>
        <p className="text-[12px] text-text-secondary mt-4">
          Already have an account?{' '}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </Panel>
    </div>
  )
}

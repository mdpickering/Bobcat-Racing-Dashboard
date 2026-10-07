'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MailCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import AuthShell from '@/components/auth/AuthShell'

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
      <AuthShell
        title="Check your email"
        icon={<MailCheck size={20} aria-hidden="true" />}
        description={
          <>
            We sent a confirmation link to <strong className="text-text-primary">{email}</strong>. Confirm your account, then sign in.
          </>
        }
        footer={
          <Link href="/login" className="font-medium text-accent hover:underline">
            Go to sign in
          </Link>
        }
      >
        <p className="text-xs text-text-muted">A team admin approves new accounts before you can open the dashboard.</p>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Join the team"
      description="Create your account. A team admin approves new members before they can open the dashboard."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div>
          <label htmlFor="signup-name" className="mb-1.5 block font-medium text-text-secondary">
            Name
          </label>
          <Input id="signup-name" required autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="rounded-xl !bg-bg py-2.5" />
        </div>
        <div>
          <label htmlFor="signup-year" className="mb-1.5 block font-medium text-text-secondary">
            Academic year
          </label>
          <Select id="signup-year" value={year} onChange={(e) => setYear(e.target.value)} className="rounded-xl !bg-bg py-2.5">
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="signup-email" className="mb-1.5 block font-medium text-text-secondary">
            Email
          </label>
          <Input id="signup-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl !bg-bg py-2.5" />
        </div>
        <div>
          <label htmlFor="signup-password" className="mb-1.5 block font-medium text-text-secondary">
            Password
          </label>
          <Input
            id="signup-password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl !bg-bg py-2.5"
          />
          <p className="mt-1 text-2xs text-text-muted">At least 6 characters.</p>
        </div>
        {error && (
          <p role="alert" className="text-status-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={loading} className="w-full rounded-xl py-2.5 active:scale-[0.98]">
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthShell>
  )
}

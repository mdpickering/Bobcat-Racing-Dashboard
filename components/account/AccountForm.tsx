'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, LogOut, Moon, Sun } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Avatar from '@/components/ui/Avatar'
import { createClient } from '@/lib/supabase/client'
import { updateOwnProfile } from '@/lib/supabase/queries/profile'
import { useTheme } from '@/components/theme/ThemeProvider'
import type { Profile } from '@/types/user'

const YEAR_OPTIONS = ['', 'Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate']

export default function AccountForm({ profile, emailSection }: { profile: Profile; emailSection?: React.ReactNode }) {
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()
  const [displayName, setDisplayName] = useState(profile.display_name ?? '')
  const [year, setYear] = useState(profile.year ?? '')
  const [major, setMajor] = useState(profile.major ?? '')
  const [skillsText, setSkillsText] = useState((profile.skills ?? []).join(', '))
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const supabase = createClient()
      await updateOwnProfile(supabase, profile.id, {
        display_name: displayName.trim(),
        year: year || null,
        major: major.trim() || null,
        skills: skillsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        avatar_url: avatarUrl.trim() || null,
      })
      setSaved(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile.')
    } finally {
      setSaving(false)
    }
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Panel className="p-5">
        <div className="flex items-center gap-4">
          <Avatar name={displayName || profile.email} src={avatarUrl || undefined} size={56} />
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold text-text-primary">{displayName || 'Unnamed'}</h1>
            <p className="truncate text-xs text-text-muted">{profile.email}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge tone="gold">{profile.role.replace('_', ' ')}</Badge>
              <Badge tone={profile.approved ? 'emerald' : 'amber'}>{profile.approved ? 'Approved' : 'Pending approval'}</Badge>
              {!profile.active && <Badge tone="rose">Inactive</Badge>}
            </div>
          </div>
        </div>
      </Panel>

      <Panel className="p-5">
        <h2 className="mb-4 text-xs font-bold uppercase tracking-wide text-text-primary">Profile</h2>
        <form onSubmit={handleSave} className="space-y-3 text-xs">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Display name</label>
            <Input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Year</label>
              <Select value={year} onChange={(e) => setYear(e.target.value)}>
                {YEAR_OPTIONS.map((y) => (
                  <option key={y} value={y}>
                    {y || 'Not set'}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Major</label>
              <Input value={major} onChange={(e) => setMajor(e.target.value)} placeholder="e.g. Mechanical Engineering" />
            </div>
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Skills</label>
            <Input value={skillsText} onChange={(e) => setSkillsText(e.target.value)} placeholder="Comma-separated, e.g. SolidWorks, Welding, Python" />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase text-text-muted">Avatar URL</label>
            <Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" />
          </div>

          {error && <p className="text-rose-400">{error}</p>}
          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={saving || !displayName.trim()}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-emerald-400">
                <Check size={12} /> Saved
              </span>
            )}
          </div>
        </form>
      </Panel>

      <Panel className="p-5">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-text-primary">Preferences</h2>
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-secondary">Theme</span>
          <Button type="button" size="sm" variant="secondary" onClick={toggleTheme}>
            {theme === 'dark' ? <Moon size={13} /> : <Sun size={13} />}
            {theme === 'dark' ? 'Dark' : 'Light'}
          </Button>
        </div>
      </Panel>

      {emailSection}

      <Panel className="p-5">
        <Button type="button" variant="danger" onClick={handleLogout}>
          <LogOut size={13} /> Log out
        </Button>
      </Panel>
    </div>
  )
}

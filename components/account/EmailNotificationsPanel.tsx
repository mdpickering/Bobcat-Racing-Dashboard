'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { createClient } from '@/lib/supabase/client'
import { setEmailPreference } from '@/lib/supabase/queries/emailPreferences'
import { getErrorMessage } from '@/lib/errors'
import type { EmailPreferenceCategory } from '@/types/database'

type RowState = { status: 'idle' | 'saving' | 'saved' | 'error'; message?: string }

interface EmailNotificationsPanelProps {
  categories: EmailPreferenceCategory[]
  email: string | null
  loadError?: string | null
}

// Each switch saves immediately: the change shows at once, the row shows "Saving…" then "Saved", and
// if the save fails the switch snaps back and the row says why. Email is only ever an addition —
// the in-app notification is created either way.
export default function EmailNotificationsPanel({ categories, email, loadError }: EmailNotificationsPanelProps) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => Object.fromEntries(categories.map((c) => [c.key, c.enabled])))
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    const t = timers.current
    return () => Object.values(t).forEach(clearTimeout)
  }, [])

  function setRow(key: string, state: RowState) {
    setRows((r) => ({ ...r, [key]: state }))
  }

  async function toggle(category: EmailPreferenceCategory) {
    const key = category.key
    if (rows[key]?.status === 'saving') return
    const next = !enabled[key]
    clearTimeout(timers.current[key])
    setEnabled((e) => ({ ...e, [key]: next }))
    setRow(key, { status: 'saving' })
    try {
      await setEmailPreference(createClient(), key, next)
      setRow(key, { status: 'saved' })
      timers.current[key] = setTimeout(() => setRow(key, { status: 'idle' }), 2500)
    } catch (err) {
      setEnabled((e) => ({ ...e, [key]: !next }))
      setRow(key, { status: 'error', message: getErrorMessage(err, 'Could not save this setting.') })
    }
  }

  return (
    <Panel className="p-5">
      <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-text-primary">Email Notifications</h2>
      <p className="mb-4 text-xs text-text-muted">
        Choose which notifications you want to receive by email{email ? <> at <span className="text-text-secondary">{email}</span></> : ''}. You will always
        still see every notification in the app.
      </p>

      {loadError ? (
        <p className="text-xs text-rose-400">{loadError}</p>
      ) : categories.length === 0 ? (
        <p className="text-xs text-text-muted">No email notification categories are available yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {categories.map((c) => {
            const state = rows[c.key] ?? { status: 'idle' }
            const on = enabled[c.key]
            return (
              <li key={c.key} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div id={`email-pref-${c.key}`} className="text-xs font-semibold text-text-primary">
                    {c.label}
                  </div>
                  <div className="mt-0.5 text-[11px] text-text-muted">{c.description}</div>
                  {state.status === 'error' && <div className="mt-1 text-[11px] text-rose-400">{state.message}</div>}
                </div>
                <div className="flex flex-shrink-0 items-center gap-2.5">
                  <span className="flex w-16 items-center justify-end gap-1 text-[10px] font-mono text-text-muted" aria-live="polite">
                    {state.status === 'saving' && (
                      <>
                        <Loader2 size={11} className="animate-spin" /> Saving
                      </>
                    )}
                    {state.status === 'saved' && (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <Check size={11} /> Saved
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-labelledby={`email-pref-${c.key}`}
                    disabled={state.status === 'saving'}
                    onClick={() => toggle(c)}
                    className={`relative h-5 w-9 flex-shrink-0 rounded-full border transition-colors disabled:opacity-60 ${
                      on ? 'border-qu-gold bg-qu-gold' : 'border-border bg-surface-raised'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${
                        on ? 'left-[18px] bg-qu-navy' : 'left-0.5 bg-text-muted'
                      }`}
                    />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

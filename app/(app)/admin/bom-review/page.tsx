import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { listBomLines } from '@/lib/supabase/queries/bom'
import { isCtoOrAdmin } from '@/lib/permissions/roles'
import { flagSeverity, needsCheck, seasonOptions, type BomLine } from '@/lib/bom'
import type { Profile } from '@/types/user'
import ErrorState, { PermissionDeniedState } from '@/components/ui/ErrorState'
import EmptyState from '@/components/ui/EmptyState'
import LimitNotice from '@/components/ui/LimitNotice'
import AdminNav from '@/components/admin/AdminNav'
import BomReviewCard from '@/components/admin/BomReviewCard'

export const metadata = { title: 'BOM review' }

const PAGE = 25

type Show = 'check' | 'notes' | 'done' | 'all'
const isShow = (v: string | undefined): v is Show => v === 'check' || v === 'notes' || v === 'done' || v === 'all'

const isMissingTable = (e: unknown) => ['PGRST205', '42P01'].includes((e as { code?: string } | null)?.code ?? '')

// Which flagged lines belong in each tab. "To check" is the real questions nobody has answered; "Notes" is housekeeping
// the spreadsheet flagged (a link rebuilt from the part number, a date from a file name...); "Done" is what has been
// checked or ignored; "All flagged" is everything with a flag.
const matchers: Record<Show, (l: BomLine) => boolean> = {
  check: needsCheck,
  notes: (l) => l.review_status === 'open' && flagSeverity(l.review_flag) === 'note',
  done: (l) => Boolean(l.review_flag) && l.review_status !== 'open',
  all: (l) => Boolean(l.review_flag),
}

export default async function BomReviewPage({ searchParams }: { searchParams: { [key: string]: string | undefined } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  if (!profile) return <ErrorState message="Could not load your profile." />
  if (!isCtoOrAdmin(profile as Profile)) return <PermissionDeniedState message="Reviewing the BOM is limited to CTO and Admin accounts." />

  let lines
  try {
    lines = await listBomLines(supabase, { withCosts: true })
  } catch (e) {
    return (
      <div className="space-y-5">
        <Heading />
        <AdminNav />
        <ErrorState message={isMissingTable(e) ? 'The BOM tables are not set up yet. Run migrations 0044 and 0045, then the BOM data file.' : 'Could not load the BOM.'} />
      </div>
    )
  }

  const show: Show = isShow(searchParams.show) ? searchParams.show : 'check'
  const limit = Math.min(Math.max(Number(searchParams.limit) || PAGE, PAGE), 2000)

  const counts = {
    check: lines.filter(matchers.check).length,
    notes: lines.filter(matchers.notes).length,
    done: lines.filter(matchers.done).length,
    all: lines.filter(matchers.all).length,
  }
  // progress is measured on the real questions only: of every line that ever asked one, how many have been dealt with
  const questions = lines.filter((l) => flagSeverity(l.review_flag) === 'check')
  const answered = questions.filter((l) => l.review_status !== 'open').length

  const shown = lines.filter(matchers[show])
  const visible = shown.slice(0, limit)

  const subsystems = Array.from(new Set(lines.map((l) => l.subsystem))).sort((a, b) => a.localeCompare(b))
  const seasons = seasonOptions(lines)
  const vendors = Array.from(new Set(lines.map((l) => l.vendor).filter((v): v is string => Boolean(v)))).sort((a, b) => a.localeCompare(b))

  const tab = (id: Show, label: string) => (
    <Link
      key={id}
      href={id === 'check' ? '/admin/bom-review' : `/admin/bom-review?show=${id}`}
      aria-current={show === id ? 'page' : undefined}
      className={`touch-target inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${show === id ? 'border-ws text-text-primary' : 'border-transparent text-text-muted hover:text-text-primary'}`}
    >
      {label} <span className="font-normal text-text-muted">({counts[id]})</span>
    </Link>
  )

  return (
    <div className="space-y-5">
      <Heading />
      <AdminNav />

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs text-text-secondary">
            <span className="font-semibold text-text-primary">{answered}</span> of <span className="font-semibold text-text-primary">{questions.length}</span> questions answered
          </p>
          <Link href="/bom" className="text-xs text-accent-blue hover:underline">
            Back to BOM Lookup
          </Link>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-label="BOM questions answered" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={answered}>
          <div className="h-full rounded-full bg-status-success" style={{ width: `${questions.length === 0 ? 0 : Math.round((answered / questions.length) * 100)}%` }} />
        </div>
      </div>

      <nav aria-label="BOM review lists" className="flex flex-wrap gap-1 border-b border-border">
        {tab('check', 'To check')}
        {tab('notes', 'Notes')}
        {tab('done', 'Done')}
        {tab('all', 'All flagged')}
      </nav>

      {visible.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={show === 'check' ? 'Nothing left to check' : 'Nothing here'}
          description={show === 'check' ? 'Every question from the spreadsheet has been answered or ignored.' : 'No lines match this list.'}
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((l) => (
            <li key={l.id}>
              <BomReviewCard line={l} subsystems={subsystems} seasons={seasons} vendors={vendors} />
            </li>
          ))}
        </ul>
      )}

      {shown.length > visible.length && <LimitNotice noun="lines" limit={limit} searchParams={searchParams} pathname="/admin/bom-review" />}
    </div>
  )
}

function Heading() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-text-primary">BOM review</h1>
      <p className="mt-0.5 text-xs text-text-secondary">Go through the lines the spreadsheet flagged. Mark each one right, correct it, or ignore it.</p>
    </div>
  )
}

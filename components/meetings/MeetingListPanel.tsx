import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import SectionHeader from '@/components/ui/SectionHeader'
import StatusBadge from '@/components/ui/StatusBadge'
import EmptyState from '@/components/ui/EmptyState'
import { formatDeadline } from '@/lib/deadline'
import type { TechnicalMeeting } from '@/types/database'

function MeetingRow({ meeting }: { meeting: TechnicalMeeting }) {
  return (
    <Link
      href={`/meetings/${meeting.id}`}
      className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 text-xs last:border-b-0 hover:bg-surface-raised"
    >
      <div className="min-w-0">
        <p className="font-semibold text-text-primary">{meeting.title}</p>
        <p className="mt-0.5 text-text-muted">
          {formatDeadline(meeting.meeting_date)}
          {meeting.start_time ? ` · ${meeting.start_time.slice(0, 5)}` : ''}
        </p>
      </div>
      <StatusBadge domain="meeting" value={meeting.status}>
        {meeting.status === 'in_progress' ? 'In progress' : meeting.status[0].toUpperCase() + meeting.status.slice(1)}
      </StatusBadge>
    </Link>
  )
}

export default function MeetingListPanel({ upcoming, completed }: { upcoming: TechnicalMeeting[]; completed: TechnicalMeeting[] }) {
  return (
    <div className="space-y-6">
      <div>
        <SectionHeader title="Upcoming & in progress" />
        <Panel>
          {upcoming.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={CalendarDays} title="No meetings scheduled" description="Create one to start building an agenda." />
            </div>
          ) : (
            upcoming.map((m) => <MeetingRow key={m.id} meeting={m} />)
          )}
        </Panel>
      </div>

      <div>
        <SectionHeader title="Completed" description="Read-only history — decisions, notes and the tasks each meeting spawned." />
        <Panel>
          {completed.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={CalendarDays} title="No completed meetings yet" />
            </div>
          ) : (
            completed.map((m) => <MeetingRow key={m.id} meeting={m} />)
          )}
        </Panel>
      </div>
    </div>
  )
}

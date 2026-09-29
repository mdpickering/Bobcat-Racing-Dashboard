'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lightbulb } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import SectionHeader from '@/components/ui/SectionHeader'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { addAgendaItem, dismissSuggestion } from '@/lib/supabase/queries/meetings'
import { getErrorMessage } from '@/lib/errors'
import type { SuggestedMeetingTopic } from '@/types/database'

const CATEGORY_LABEL: Record<SuggestedMeetingTopic['category'], string> = {
  overdue: 'Overdue',
  due_soon: 'Due soon',
  no_deadline: 'No deadline set',
  blocked: 'Blocked',
  milestone: 'Upcoming milestone',
  task_request: 'Task request awaiting review',
  purchasing: 'Purchasing awaiting a decision',
  cad: 'CAD awaiting review',
  previous_action: 'Previous meeting',
}

const CATEGORY_ORDER: SuggestedMeetingTopic['category'][] = ['overdue', 'blocked', 'due_soon', 'milestone', 'task_request', 'cad', 'purchasing', 'no_deadline']

interface SuggestedTopicsPanelProps {
  meetingId: string
  topics: SuggestedMeetingTopic[]
}

export default function SuggestedTopicsPanel({ meetingId, topics }: SuggestedTopicsPanelProps) {
  const router = useRouter()
  const toast = useToast()
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const key = (t: SuggestedMeetingTopic) => `${t.sourceType}:${t.sourceId}`

  async function handleAdd(t: SuggestedMeetingTopic) {
    setBusyKey(key(t))
    try {
      await addAgendaItem(createClient(), { meeting_id: meetingId, title: t.title, source_type: t.sourceType, source_id: t.sourceId })
      router.refresh()
    } catch (err) {
      toast.push(getErrorMessage(err, 'Could not add this topic.'), 'danger')
    } finally {
      setBusyKey(null)
    }
  }

  async function handleDismiss(t: SuggestedMeetingTopic) {
    setBusyKey(key(t))
    try {
      await dismissSuggestion(createClient(), meetingId, t.sourceType, t.sourceId)
      router.refresh()
    } catch (err) {
      toast.push(getErrorMessage(err, 'Could not dismiss this suggestion.'), 'danger')
    } finally {
      setBusyKey(null)
    }
  }

  const grouped = CATEGORY_ORDER.map((category) => ({ category, items: topics.filter((t) => t.category === category) })).filter((g) => g.items.length > 0)

  return (
    <div className="mb-4">
      <SectionHeader as="h3" title="Suggested topics" description="Pulled from real tasks, milestones, task requests, purchasing and CAD — nothing here is invented." />
      <Panel className="p-4">
        {grouped.length === 0 ? (
          <EmptyState icon={Lightbulb} title="Nothing needs attention right now" description="No overdue or due-soon work, blocked tasks, or pending reviews were found." />
        ) : (
          <div className="space-y-4">
            {grouped.map(({ category, items }) => (
              <div key={category}>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{CATEGORY_LABEL[category]}</p>
                <ul className="space-y-1.5">
                  {items.map((t) => (
                    <li key={key(t)} className="flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="truncate text-text-primary">{t.title}</p>
                        {t.detail && <p className="text-[11px] text-text-muted">{t.detail}</p>}
                      </div>
                      <div className="flex flex-shrink-0 gap-1.5">
                        <Button size="sm" variant="secondary" disabled={busyKey === key(t)} onClick={() => handleDismiss(t)}>
                          Dismiss
                        </Button>
                        <Button size="sm" disabled={busyKey === key(t)} onClick={() => handleAdd(t)}>
                          Add
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

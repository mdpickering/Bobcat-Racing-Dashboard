'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { History } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import SectionHeader from '@/components/ui/SectionHeader'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { addAgendaItem } from '@/lib/supabase/queries/meetings'
import { getErrorMessage } from '@/lib/errors'
import { formatDeadline } from '@/lib/deadline'
import type { PreviousMeetingFollowUp } from '@/lib/supabase/queries/meetings'

interface PreviousMeetingFollowUpPanelProps {
  meetingId: string
  followUp: PreviousMeetingFollowUp
  addedSourceIds: Set<string>
}

// "Previous Meeting Follow-Up": unresolved action items from the last completed meeting, shown at
// the top of a new one so nothing quietly falls through the cracks. Adding one here creates a
// 'previous_action' agenda item pointing back at the original action item (the unique source guard
// in migration 0041 stops it being added twice to this same meeting).
export default function PreviousMeetingFollowUpPanel({ meetingId, followUp, addedSourceIds }: PreviousMeetingFollowUpPanelProps) {
  const router = useRouter()
  const toast = useToast()
  const [addingId, setAddingId] = useState<string | null>(null)

  if (followUp.unresolvedActionItems.length === 0) return null

  async function handleAdd(id: string, title: string) {
    setAddingId(id)
    try {
      await addAgendaItem(createClient(), { meeting_id: meetingId, title, source_type: 'previous_action', source_id: id })
      router.refresh()
    } catch (err) {
      toast.push(getErrorMessage(err, 'Could not add this to the agenda.'), 'danger')
    } finally {
      setAddingId(null)
    }
  }

  return (
    <div className="mb-4">
      <SectionHeader
        as="h3"
        title="Previous meeting follow-up"
        description={`${followUp.unresolvedActionItems.length} unresolved action item${followUp.unresolvedActionItems.length === 1 ? '' : 's'} from ${followUp.meeting.title} (${formatDeadline(followUp.meeting.meeting_date)})`}
      />
      <Panel className="divide-y divide-border">
        {followUp.unresolvedActionItems.map((a) => {
          const alreadyAdded = addedSourceIds.has(a.id)
          return (
            <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <History size={13} className="flex-shrink-0 text-text-muted" />
                <div className="min-w-0">
                  <p className="truncate font-medium text-text-primary">{a.title}</p>
                  <p className="text-text-muted">
                    {a.assignee?.display_name || a.assignee?.email || 'Unassigned'}
                    {a.due_date ? ` · due ${formatDeadline(a.due_date)}` : ''}
                    {a.linked_task ? ' · became a task' : ''}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="secondary" disabled={alreadyAdded || addingId === a.id} onClick={() => handleAdd(a.id, a.title)}>
                {alreadyAdded ? 'On agenda' : addingId === a.id ? 'Adding…' : 'Add'}
              </Button>
            </div>
          )
        })}
      </Panel>
    </div>
  )
}

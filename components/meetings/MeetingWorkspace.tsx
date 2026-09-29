'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import SectionHeader from '@/components/ui/SectionHeader'
import EmptyState from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { addAgendaItem } from '@/lib/supabase/queries/meetings'
import { getErrorMessage } from '@/lib/errors'
import type { PreviousMeetingFollowUp } from '@/lib/supabase/queries/meetings'
import type { Subsystem, SuggestedMeetingTopic, TechnicalMeeting, TechnicalMeetingActionItem, TechnicalMeetingAgendaItem } from '@/types/database'
import MeetingHeaderBar from './MeetingHeaderBar'
import PreviousMeetingFollowUpPanel from './PreviousMeetingFollowUpPanel'
import SuggestedTopicsPanel from './SuggestedTopicsPanel'
import AgendaItemCard from './AgendaItemCard'
import ActionItemRow from './ActionItemRow'
import ActionItemModal from './ActionItemModal'

interface AssignableProfile {
  id: string
  display_name: string | null
  email: string | null
}

interface MeetingWorkspaceProps {
  meeting: TechnicalMeeting
  initialAgendaItems: TechnicalMeetingAgendaItem[]
  initialActionItems: TechnicalMeetingActionItem[]
  suggestedTopics: SuggestedMeetingTopic[]
  previousFollowUp: PreviousMeetingFollowUp | null
  subsystems: Subsystem[]
  assignableProfiles: AssignableProfile[]
  canManage: boolean
  canRecord: boolean
}

export default function MeetingWorkspace({
  meeting,
  initialAgendaItems,
  initialActionItems,
  suggestedTopics,
  previousFollowUp,
  subsystems,
  assignableProfiles,
  canManage,
  canRecord,
}: MeetingWorkspaceProps) {
  const router = useRouter()
  const toast = useToast()
  const [manualTitle, setManualTitle] = useState('')
  const [addingManual, setAddingManual] = useState(false)
  const [modalState, setModalState] = useState<{ agendaItemId: string | null; editing: TechnicalMeetingActionItem | null } | null>(null)

  // A plain recorder (COO, not manager) may only keep working the meeting while it isn't completed
  // yet — once completed, only a manager can still touch it (a correction). Mirrors the RLS policies
  // on agenda/action items exactly.
  const canEditNow = canManage || (canRecord && meeting.status !== 'completed')

  const agendaItems = [...initialAgendaItems].sort((a, b) => a.sort_order - b.sort_order)
  const actionItemsByAgenda = new Map<string, TechnicalMeetingActionItem[]>()
  const generalActionItems: TechnicalMeetingActionItem[] = []
  for (const a of initialActionItems) {
    if (a.agenda_item_id) {
      actionItemsByAgenda.set(a.agenda_item_id, [...(actionItemsByAgenda.get(a.agenda_item_id) ?? []), a])
    } else {
      generalActionItems.push(a)
    }
  }
  const addedSourceIds = new Set(agendaItems.filter((a) => a.source_type === 'previous_action' && a.source_id).map((a) => a.source_id as string))

  async function handleAddManualTopic(e: React.FormEvent) {
    e.preventDefault()
    if (!manualTitle.trim()) return
    setAddingManual(true)
    try {
      await addAgendaItem(createClient(), { meeting_id: meeting.id, title: manualTitle.trim(), sort_order: agendaItems.length })
      setManualTitle('')
      router.refresh()
    } catch (err) {
      toast.push(getErrorMessage(err, 'Could not add this topic.'), 'danger')
    } finally {
      setAddingManual(false)
    }
  }

  return (
    <div>
      <MeetingHeaderBar meeting={meeting} canManage={canManage} canRecord={canRecord} />

      {canManage && meeting.status !== 'completed' && previousFollowUp && (
        <PreviousMeetingFollowUpPanel meetingId={meeting.id} followUp={previousFollowUp} addedSourceIds={addedSourceIds} />
      )}

      {canManage && meeting.status !== 'completed' && <SuggestedTopicsPanel meetingId={meeting.id} topics={suggestedTopics} />}

      <div className="mb-4">
        <SectionHeader title="Agenda" />
        {agendaItems.length === 0 ? (
          <EmptyState title="No agenda topics yet" description={canManage ? 'Add a suggested topic above, or a manual one below.' : 'The meeting manager hasn’t built the agenda yet.'} />
        ) : (
          <div className="space-y-2.5">
            {agendaItems.map((item, idx) => (
              <AgendaItemCard
                key={item.id}
                item={item}
                actionItems={actionItemsByAgenda.get(item.id) ?? []}
                canManage={canManage}
                canEditNow={canEditNow}
                neighbours={{ prev: agendaItems[idx - 1] ?? null, next: agendaItems[idx + 1] ?? null }}
                onAddActionItem={() => setModalState({ agendaItemId: item.id, editing: null })}
                onEditActionItem={(a) => setModalState({ agendaItemId: item.id, editing: a })}
              />
            ))}
          </div>
        )}
        {canManage && (
          <form onSubmit={handleAddManualTopic} className="mt-2.5 flex gap-2">
            <Input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} placeholder="Add a manual topic…" disabled={addingManual} />
            <Button type="submit" size="sm" variant="secondary" disabled={addingManual || !manualTitle.trim()}>
              <Plus size={13} /> Add
            </Button>
          </form>
        )}
      </div>

      {(generalActionItems.length > 0 || canEditNow) && (
        <div className="mb-4">
          <SectionHeader title="Other action items" description="Not tied to a specific agenda topic." />
          {generalActionItems.length > 0 && (
            <div className="mb-2 space-y-1.5">
              {generalActionItems.map((a) => (
                <ActionItemRow
                  key={a.id}
                  item={a}
                  canEditNow={canEditNow}
                  canManage={canManage}
                  onEdit={() => setModalState({ agendaItemId: null, editing: a })}
                />
              ))}
            </div>
          )}
          {canEditNow && (
            <button
              type="button"
              onClick={() => setModalState({ agendaItemId: null, editing: null })}
              className="flex items-center gap-1 text-[11px] text-text-muted hover:text-accent-blue"
            >
              <Plus size={11} /> Add action item
            </button>
          )}
        </div>
      )}

      <ActionItemModal
        open={modalState !== null}
        onClose={() => setModalState(null)}
        meetingId={meeting.id}
        agendaItemId={modalState?.agendaItemId ?? null}
        editing={modalState?.editing ?? null}
        subsystems={subsystems}
        assignableProfiles={assignableProfiles}
      />
    </div>
  )
}

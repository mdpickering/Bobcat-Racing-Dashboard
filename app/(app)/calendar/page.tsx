import ComingSoon from '@/components/layout/ComingSoon'
import { CalendarDays } from 'lucide-react'

export default function CalendarPage() {
  return (
    <ComingSoon
      icon={CalendarDays}
      title="Calendar"
      description="Team events, recurring meetings, and task deadlines in a month view are built in the next application chunk."
    />
  )
}

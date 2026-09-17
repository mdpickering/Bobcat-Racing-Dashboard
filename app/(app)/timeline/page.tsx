import ComingSoon from '@/components/layout/ComingSoon'
import { GanttChartSquare } from 'lucide-react'

export default function TimelinePage() {
  return (
    <ComingSoon
      icon={GanttChartSquare}
      title="Master Timeline"
      description="The shared W1-W15 build timeline with per-subsystem milestone cells is built in the next application chunk."
    />
  )
}

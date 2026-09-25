'use client'

import FilterBar, { useUrlFilters } from '@/components/ui/FilterBar'
import type { Subsystem, SubsystemCategory } from '@/types/database'

const STATUSES = ['To Do', 'In Progress', 'Blocked', 'Review', 'Complete']
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']

export default function TaskFilters({ subsystems, categories }: { subsystems: Subsystem[]; categories: SubsystemCategory[] }) {
  const filters = useUrlFilters()
  const subsystemId = filters.get('subsystem')
  const filteredCategories = subsystemId ? categories.filter((c) => c.subsystem_id === subsystemId) : categories

  return (
    <FilterBar
      search={{ key: 'search', placeholder: 'Search tasks…' }}
      fields={[
        { key: 'subsystem', allLabel: 'All subsystems', options: subsystems.map((s) => ({ value: s.id, label: s.name })) },
        { key: 'category', allLabel: 'All categories', options: filteredCategories.map((c) => ({ value: c.id, label: c.name })) },
        { key: 'priority', allLabel: 'All priorities', className: 'sm:w-36', options: PRIORITIES.map((p) => ({ value: p, label: p })) },
        { key: 'status', allLabel: 'All statuses', className: 'sm:w-36', options: STATUSES.map((s) => ({ value: s, label: s })) },
      ]}
    />
  )
}
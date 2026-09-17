import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  ListChecks,
  Boxes,
  CalendarDays,
  GanttChartSquare,
  ShoppingCart,
  Ruler,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tasks', label: 'Tasks', icon: ListChecks },
  { href: '/subsystems', label: 'Subsystems', icon: Boxes },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/timeline', label: 'Timeline', icon: GanttChartSquare },
  { href: '/purchasing', label: 'Purchasing', icon: ShoppingCart },
  { href: '/cad', label: 'CAD Review', icon: Ruler },
]

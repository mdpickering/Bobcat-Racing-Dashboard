import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  ListChecks,
  Boxes,
  CalendarDays,
  GanttChartSquare,
  ShoppingCart,
  Ruler,
  ShieldCheck,
  Gauge,
  Briefcase,
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

// Rendered for Business members, and read-only for the COO and cto/admin — see Sidebar.tsx. The page checks access
// itself and RLS (migration 0033) is the real boundary.
export const BUSINESS_NAV_ITEMS: NavItem[] = [{ href: '/business', label: 'Business', icon: Briefcase }]

// Rendered only for coo/cto/admin — see Sidebar.tsx. The page itself also gates on
// canManageOperations() independently of nav visibility, and RLS is the real boundary
// underneath both.
export const OPERATIONS_NAV_ITEMS: NavItem[] = [{ href: '/operations', label: 'Operations', icon: Gauge }]

// Rendered only for cto/admin — see Sidebar.tsx. The route handlers
// themselves also gate on isCtoOrAdmin() independently of nav visibility,
// and RLS is the real boundary underneath both.
export const ADMIN_NAV_ITEMS: NavItem[] = [{ href: '/admin', label: 'Administration', icon: ShieldCheck }]

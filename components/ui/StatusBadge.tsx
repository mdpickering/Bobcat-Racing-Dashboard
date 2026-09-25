import { AlertTriangle, CheckCircle2, Circle, Info, Clock, Star } from 'lucide-react'
import Badge from './Badge'
import { statusTone, type StatusDomain, type StatusTone } from '@/lib/status'

const ICON: Record<StatusTone, typeof Circle> = {
  success: CheckCircle2,
  warning: Clock,
  danger: AlertTriangle,
  info: Info,
  neutral: Circle,
  brand: Star,
}

interface StatusBadgeProps {
  // either a tone directly, or a domain + value looked up in the shared registry
  tone?: StatusTone
  domain?: StatusDomain
  value?: string
  children?: React.ReactNode
  className?: string
}

// A status is always words plus a shape, never colour alone.
export default function StatusBadge({ tone, domain, value, children, className }: StatusBadgeProps) {
  const resolved: StatusTone = tone ?? (domain && value ? statusTone(domain, value) : 'neutral')
  const Icon = ICON[resolved]
  return (
    <Badge tone={resolved} className={className}>
      <span className="inline-flex items-center gap-1">
        <Icon size={11} aria-hidden="true" />
        {children ?? value}
      </span>
    </Badge>
  )
}

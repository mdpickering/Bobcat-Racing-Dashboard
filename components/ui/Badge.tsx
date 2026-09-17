type BadgeTone = 'emerald' | 'gold' | 'rose' | 'sky' | 'slate' | 'amber'

interface BadgeProps {
  tone?: BadgeTone
  children: React.ReactNode
  className?: string
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  gold: 'bg-qu-gold/15 text-qu-gold border-qu-gold/30',
  rose: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  sky: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  amber: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  slate: 'bg-text-secondary/10 text-text-secondary border-border',
}

export default function Badge({ tone = 'slate', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wide border ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

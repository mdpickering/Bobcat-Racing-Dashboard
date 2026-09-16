type BadgeTone = 'emerald' | 'gold' | 'rose' | 'sky' | 'slate'

interface BadgeProps {
  tone?: BadgeTone
  children: React.ReactNode
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  gold: 'bg-qu-gold/15 text-qu-gold border-qu-gold/30',
  rose: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  sky: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  slate: 'bg-white/5 text-slate-300 border-white/10',
}

export default function Badge({ tone = 'slate', children }: BadgeProps) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wide border ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  )
}

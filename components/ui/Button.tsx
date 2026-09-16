import { ButtonHTMLAttributes, forwardRef } from 'react'

type Variant = 'primary' | 'secondary' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-qu-gold hover:bg-amber-400 text-qu-navy font-bold shadow-glow',
  secondary: 'bg-white/5 hover:bg-white/10 text-slate-200 border border-white/15',
  danger: 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', className = '', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`px-4 py-2 rounded-xl text-xs font-mono font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
        {...props}
      />
    )
  }
)

Button.displayName = 'Button'

export default Button

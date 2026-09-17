import { ButtonHTMLAttributes, forwardRef } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-qu-gold hover:bg-amber-400 text-qu-navy font-bold shadow-glow',
  secondary: 'bg-surface-raised hover:bg-border/60 text-text-primary border border-border',
  danger: 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30',
  ghost: 'bg-transparent hover:bg-surface-raised text-text-secondary hover:text-text-primary',
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-[11px]',
  md: 'px-4 py-2 text-xs',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-mono font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`}
        {...props}
      />
    )
  }
)

Button.displayName = 'Button'

export default Button

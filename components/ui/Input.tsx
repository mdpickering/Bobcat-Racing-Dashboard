import { InputHTMLAttributes, forwardRef } from 'react'

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => (
    <input
      ref={ref}
      className={`w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent-blue disabled:opacity-50 ${className}`}
      {...props}
    />
  )
)
Input.displayName = 'Input'
export default Input

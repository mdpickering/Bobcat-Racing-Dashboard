import { SelectHTMLAttributes, forwardRef } from 'react'

const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = '', children, ...props }, ref) => (
    <select
      ref={ref}
      className={`w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-primary outline-none transition-colors focus:border-accent-blue disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </select>
  )
)
Select.displayName = 'Select'
export default Select

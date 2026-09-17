import { TextareaHTMLAttributes, forwardRef } from 'react'

const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = '', ...props }, ref) => (
    <textarea
      ref={ref}
      className={`w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent-blue disabled:opacity-50 ${className}`}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'
export default Textarea

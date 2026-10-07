import { HTMLAttributes } from 'react'

export default function Panel({
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-surface border border-border rounded-2xl shadow-panel ${className}`}
      {...props}
    />
  )
}

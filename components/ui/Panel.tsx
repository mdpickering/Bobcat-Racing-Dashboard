import { HTMLAttributes } from 'react'

export default function Panel({
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-qu-surface/70 backdrop-blur-md border border-white/10 rounded-xl shadow-panel ${className}`}
      {...props}
    />
  )
}

import { AlertTriangle } from 'lucide-react'

export default function ErrorState({ message = 'Something went wrong loading this data.' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 px-6 py-10 text-center">
      <AlertTriangle size={20} className="text-rose-400" />
      <p className="text-xs font-semibold text-rose-300">{message}</p>
    </div>
  )
}

export function PermissionDeniedState({ message = "You don't have access to this." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface px-6 py-10 text-center">
      <p className="text-xs font-semibold text-text-secondary">{message}</p>
    </div>
  )
}

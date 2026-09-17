import Skeleton, { SkeletonList } from '@/components/ui/Skeleton'

export default function AppLoading() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-3 w-72" />
      </div>
      <SkeletonList rows={5} />
    </div>
  )
}

import { createClient } from '@/lib/supabase/server'
import { globalSearch } from '@/lib/supabase/queries/search'
import SearchResultsList from '@/components/search/SearchResultsList'
import ErrorState from '@/components/ui/ErrorState'
import EmptyState from '@/components/ui/EmptyState'
import { Search } from 'lucide-react'

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined }
}) {
  const supabase = createClient()
  const query = searchParams.q?.trim() ?? ''

  let results
  if (query) {
    try {
      results = await globalSearch(supabase, query)
    } catch {
      return <ErrorState message="Could not run this search." />
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Search</h1>
        <p className="mt-0.5 text-xs font-mono text-text-muted">
          {query ? `Results for "${query}"` : 'Search tasks, subsystems, people, purchasing, and CAD reviews.'}
        </p>
      </div>

      {!query ? (
        <EmptyState icon={Search} title="Start typing to search" description="Use the search bar above to look across the whole app." />
      ) : (
        <SearchResultsList results={results ?? []} />
      )}
    </div>
  )
}

import type { SupabaseClient } from '@supabase/supabase-js'

export type SearchResultType = 'task' | 'subsystem' | 'person' | 'purchase_request' | 'cad_review'

export interface SearchResult {
  type: SearchResultType
  id: string
  title: string
  subtitle: string | null
  href: string
}

// Every query below relies on RLS to scope what the caller can actually
// see — this function never widens visibility beyond what each table's
// own SELECT policy already allows (e.g. purchase_requests/cad_reviews
// stay subsystem-scoped for members, profiles stays limited to approved
// teammates). No table here needs an ilike search-specific policy of
// its own; the existing SELECT policies apply exactly as normal.
export async function globalSearch(supabase: SupabaseClient, query: string): Promise<SearchResult[]> {
  const q = query.trim()
  if (!q) return []
  const pattern = `%${q}%`

  // People search runs as two separate ilike queries (name, email) merged
  // client-side rather than a single .or() filter — PostgREST's .or()
  // syntax treats a raw comma or parenthesis in the value as a filter
  // separator, so a search term containing one (e.g. "Smith, John") would
  // silently corrupt the query instead of matching literally.
  const [tasks, subsystems, peopleByName, peopleByEmail, purchaseRequests, cadReviews] = await Promise.all([
    supabase.from('tasks').select('id, title, subsystem:subsystems(name)').ilike('title', pattern).limit(8),
    supabase.from('subsystems').select('id, name, description').eq('active', true).ilike('name', pattern).limit(8),
    supabase.from('profiles').select('id, display_name, email, role').ilike('display_name', pattern).limit(8),
    supabase.from('profiles').select('id, display_name, email, role').ilike('email', pattern).limit(8),
    supabase.from('purchase_requests').select('id, title, subsystem:subsystems(name)').ilike('title', pattern).limit(8),
    supabase.from('cad_reviews').select('id, title, subsystem:subsystems(name)').ilike('title', pattern).limit(8),
  ])

  const results: SearchResult[] = []

  for (const t of (tasks.data ?? []) as unknown as { id: string; title: string; subsystem: { name: string } | null }[]) {
    results.push({ type: 'task', id: t.id, title: t.title, subtitle: t.subsystem?.name ?? null, href: `/tasks/${t.id}` })
  }
  for (const s of (subsystems.data ?? []) as unknown as { id: string; name: string; description: string | null }[]) {
    results.push({ type: 'subsystem', id: s.id, title: s.name, subtitle: s.description, href: `/subsystems/${s.id}` })
  }
  type PersonRow = { id: string; display_name: string | null; email: string | null; role: string }
  const people = new Map<string, PersonRow>()
  for (const p of [...((peopleByName.data ?? []) as PersonRow[]), ...((peopleByEmail.data ?? []) as PersonRow[])]) {
    people.set(p.id, p)
  }
  for (const p of people.values()) {
    results.push({
      type: 'person',
      id: p.id,
      title: p.display_name || p.email || 'Unknown',
      subtitle: p.role.replace('_', ' '),
      href: `/subsystems`,
    })
  }
  for (const pr of (purchaseRequests.data ?? []) as unknown as { id: string; title: string; subsystem: { name: string } | null }[]) {
    results.push({ type: 'purchase_request', id: pr.id, title: pr.title, subtitle: pr.subsystem?.name ?? null, href: `/purchasing/${pr.id}` })
  }
  for (const cr of (cadReviews.data ?? []) as unknown as { id: string; title: string; subsystem: { name: string } | null }[]) {
    results.push({ type: 'cad_review', id: cr.id, title: cr.title, subtitle: cr.subsystem?.name ?? null, href: `/cad/${cr.id}` })
  }

  return results
}

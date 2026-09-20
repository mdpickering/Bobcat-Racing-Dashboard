// Supabase/PostgREST errors are not always `Error` instances, so `err instanceof Error`
// alone drops the database's message (e.g. an RLS or validation error) for the generic fallback.
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

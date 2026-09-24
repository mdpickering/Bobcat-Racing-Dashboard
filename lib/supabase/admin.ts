import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Service-role client for trusted server code only (the email worker). The key comes from a
// server-side environment variable with no NEXT_PUBLIC_ prefix and this module refuses to be
// imported from client code, so the key can never reach a browser bundle.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

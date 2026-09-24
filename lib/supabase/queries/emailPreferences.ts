import type { SupabaseClient } from '@supabase/supabase-js'
import type { EmailPreferenceCategory } from '@/types/database'

// The category list comes from the database catalog, not from code, so a new category added by a
// future migration shows up here with no UI change. Preferences are read through row-level
// security, which returns only the signed-in user's own rows; a category with no stored row uses
// the catalog default.
export async function listEmailPreferences(supabase: SupabaseClient): Promise<EmailPreferenceCategory[]> {
  const [{ data: categories, error: catError }, { data: stored, error: prefError }] = await Promise.all([
    supabase.from('notification_categories').select('key, label, description, default_enabled').order('sort_order'),
    supabase.from('email_notification_preferences').select('category_key, enabled'),
  ])
  if (catError) throw catError
  if (prefError) throw prefError

  const chosen = new Map((stored ?? []).map((r) => [r.category_key as string, r.enabled as boolean]))
  return (categories ?? []).map((c) => ({
    key: c.key as string,
    label: c.label as string,
    description: c.description as string,
    default_enabled: c.default_enabled as boolean,
    enabled: chosen.get(c.key as string) ?? (c.default_enabled as boolean),
  }))
}

// set_email_preference() only ever writes the caller's own row (security invoker, own-row RLS).
export async function setEmailPreference(supabase: SupabaseClient, categoryKey: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_email_preference', { p_category: categoryKey, p_enabled: enabled })
  if (error) throw error
}

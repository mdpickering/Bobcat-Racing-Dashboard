import type { SupabaseClient } from '@supabase/supabase-js'
import type { Profile } from '@/types/user'

// role, approved, and active are never accepted here — they're excluded
// from the profiles UPDATE grant at the database level (0001_profiles.sql),
// so an attempt to set them would be rejected by Postgres before RLS is
// even evaluated. This type just keeps the client from trying.
export interface ProfileEditableFields {
  display_name: string
  year: string | null
  major: string | null
  skills: string[]
  avatar_url: string | null
}

export async function updateOwnProfile(supabase: SupabaseClient, userId: string, patch: ProfileEditableFields): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', userId).select().single()
  if (error) throw error
  return data as unknown as Profile
}

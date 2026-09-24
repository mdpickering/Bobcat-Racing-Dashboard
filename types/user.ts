export type UserRole = 'member' | 'team_lead' | 'coo' | 'cto' | 'admin'

export interface Profile {
  id: string
  display_name: string | null
  email: string | null
  role: UserRole
  year: string | null
  major: string | null
  skills: string[] | null
  avatar_url: string | null
  active: boolean
  approved: boolean
  created_at: string
  updated_at: string
}

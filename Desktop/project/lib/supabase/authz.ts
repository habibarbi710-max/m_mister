import type { LiveSession, Subscription, User } from '@/types'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export async function getAuthenticatedProfile(): Promise<{ userId: string; profile: User } | null> {
  const supabase = await getSupabaseServerClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) return null

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, section_id, role, blocked, avatar_url')
    .eq('id', authData.user.id)
    .maybeSingle()
  if (profileError || !profileData || profileData.blocked) return null
  if (profileData.role !== 'student' && profileData.role !== 'teacher' && profileData.role !== 'admin') return null

  const [phoneResult, sectionResult] = await Promise.all([
    supabase.from('profile_private').select('phone').eq('user_id', authData.user.id).maybeSingle(),
    profileData.section_id
      ? supabase.from('sections').select('name').eq('id', profileData.section_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (phoneResult.error || sectionResult.error) return null

  return {
    userId: authData.user.id,
    profile: {
      id: authData.user.id,
      name: profileData.full_name,
      email: authData.user.email ?? '',
      phone: phoneResult.data?.phone ?? '',
      section: sectionResult.data?.name ?? 'Non renseignée',
      sectionId: profileData.section_id ?? undefined,
      role: profileData.role,
      blocked: false,
      avatarUrl: profileData.avatar_url ?? undefined,
    },
  }
}

export async function getServerLiveSession(sessionId: string): Promise<LiveSession | null> {
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('app_state')
    .select('value')
    .eq('key', 'liveSessions')
    .is('owner_id', null)
    .maybeSingle()
  if (error || !data) return null
  const sessions = data.value as LiveSession[]
  return sessions.find((session) => session.id === sessionId) ?? null
}

export async function getServerSubscription(userId: string): Promise<Subscription | null> {
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('app_state')
    .select('value')
    .eq('key', `subscription:${userId}`)
    .eq('owner_id', userId)
    .maybeSingle()
  if (error || !data) return null
  return data.value as Subscription
}

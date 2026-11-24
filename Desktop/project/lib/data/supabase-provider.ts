import type { DataKey, DataProvider, DataResult, DataValue } from '@/lib/data/provider'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

const publicKeys = new Set([
  'subjects', 'lessons', 'lessonDrafts', 'deletedLessons', 'exams', 'liveSessions',
  'liveQuestions', 'liveAttendance', 'sections', 'classGroups', 'groupContentLinks',
  'schedulePolls', 'schedulePollVotes', 'groupAnnouncements', 'groupMaterials',
  'settings', 'lang', 'theme',
])

const teacherKeys = new Set([
  'subjects', 'lessons', 'lessonDrafts', 'deletedLessons', 'exams', 'liveSessions',
  'liveQuestions', 'liveAttendance', 'classGroups', 'groupContentLinks',
  'schedulePolls', 'schedulePollVotes', 'groupRescheduleRequests', 'groupAttendance',
  'classLogEntries', 'groupAssessments', 'studentGrades', 'gradeAuditLog',
  'groupAnnouncements', 'groupMaterials', 'teacherAssignments', 'lessonViews',
  'homeworkAssignments', 'homeworkSubmissions', 'teacherAnnouncements',
])

function isUserKey(key: string): boolean {
  return key === 'user' || key === 'theme' || key === 'lang'
    || key.startsWith('completed:') || key.startsWith('lastViewed:')
    || key.startsWith('quizResults:') || key.startsWith('subscription:')
    || key.startsWith('videoPosition:')
    || key === 'notifications'
}

function scopeForKey(key: DataKey): 'public' | 'authenticated' | 'user' | 'teacher' | 'admin' {
  if (publicKeys.has(key)) return 'public'
  if (isUserKey(key)) return 'user'
  if (teacherKeys.has(key)) return 'teacher'
  if (key === 'accounts' || key === 'users' || key === 'payments' || key === 'groupPayments'
    || key === 'moderationActions' || key === 'reports') return 'admin'
  return 'authenticated'
}

function ownerScope(key: DataKey, scope: ReturnType<typeof scopeForKey>, userId: string | null) {
  if (scope === 'user') return { scope, owner_id: userId }
  if (scope === 'public' || scope === 'authenticated') return { scope, owner_id: null }
  return { scope, owner_id: null }
}

async function getCurrentUserId(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export const supabaseProvider: DataProvider = {
  async read<K extends DataKey>(key: K): Promise<DataResult<DataValue<K>>> {
    try {
      const supabase = getSupabaseBrowserClient()
      const userId = await getCurrentUserId()
      const scope = scopeForKey(key)
      const owner = ownerScope(key, scope, userId)

      let query = supabase.from('app_state').select('value').eq('key', key)
      if (owner.owner_id) query = query.eq('owner_id', owner.owner_id)
      else query = query.is('owner_id', null)

      const { data, error } = await query.maybeSingle()
      if (error) throw error

      if (data) return { ok: true, data: data.value as DataValue<K> }

      if (key === 'theme') return { ok: true, data: 'light' as DataValue<K> }
      if (key === 'lang') return { ok: true, data: 'fr' as DataValue<K> }
      if (key === 'user') return { ok: true, data: null as DataValue<K> }
      if (key.startsWith('completed:') || key === 'notifications' || key === 'accounts'
        || key === 'users' || key.startsWith('quizResults:') || key.startsWith('videoPosition:')
        || key === 'subjects' || key === 'lessons' || key === 'lessonDrafts'
        || key === 'deletedLessons' || key === 'exams' || key === 'liveSessions'
        || key === 'liveQuestions' || key === 'liveAttendance' || key === 'sections'
        || key === 'classGroups' || key === 'groupEnrollments' || key === 'groupContentLinks'
        || key === 'schedulePolls' || key === 'schedulePollVotes'
        || key === 'groupRescheduleRequests' || key === 'groupAttendance'
        || key === 'classLogEntries' || key === 'groupAssessments' || key === 'studentGrades'
        || key === 'gradeAuditLog' || key === 'groupPayments' || key === 'groupAnnouncements'
        || key === 'groupMaterials' || key === 'payments' || key === 'lessonViews'
        || key === 'teacherAssignments' || key === 'contentTrash'
        || key === 'teacherProfiles' || key === 'teacherFollows' || key === 'lessonRatings'
        || key === 'lessonQuestions' || key === 'homeworkAssignments'
        || key === 'homeworkSubmissions' || key === 'teacherAnnouncements'
        || key === 'privateMessages' || key === 'messagingBlocks' || key === 'reports'
        || key === 'moderationActions' || key === 'relationshipSettings'
        || key === 'teacherEngagement' || key === 'studentActivity'
        || key === 'subjectEnrollments' || key === 'quizMetrics') {
        return { ok: true, data: (Array.isArray([]) ? [] : null) as DataValue<K> }
      }
      if (key === 'settings') {
        return { ok: true, data: { paymentsEnabled: false, gracePeriodDays: 7, pricingScope: 'group', subscriptionScope: 'platform' } as DataValue<K> }
      }
      if (key.startsWith('subscription:')) return { ok: true, data: null as DataValue<K> }
      if (key.startsWith('lastViewed:') || key.startsWith('videoPosition:')) return { ok: true, data: null as DataValue<K> }
      return { ok: true, data: (key === 'lang' ? 'fr' : null) as DataValue<K> }
    } catch (error) {
      return { ok: false, error: { code: 'storage-unavailable', message: error instanceof Error ? error.message : 'Supabase storage unavailable' } }
    }
  },

  async write<K extends DataKey>(key: K, value: DataValue<K>): Promise<DataResult<void>> {
    try {
      const supabase = getSupabaseBrowserClient()
      const userId = await getCurrentUserId()
      const scope = scopeForKey(key)
      const owner = ownerScope(key, scope, userId)

      if (scope === 'user' && !owner.owner_id) {
        return { ok: false, error: { code: 'persistence-failed', message: 'You must be logged in' } }
      }

      const { error } = await supabase.from('app_state').upsert({
        key,
        owner_id: owner.owner_id,
        scope,
        value,
        updated_at: new Date().toISOString(),
      }, { onConflict: owner.owner_id ? 'key,owner_id' : 'key' })
      if (error) throw error
      return { ok: true, data: undefined }
    } catch (error) {
      return { ok: false, error: { code: 'persistence-failed', message: error instanceof Error ? error.message : 'Unable to save data' } }
    }
  },

  async readAttachment(id: string): Promise<DataResult<Blob | undefined>> {
    try {
      const supabase = getSupabaseBrowserClient()
      const userId = await getCurrentUserId()
      if (!userId) return { ok: false, error: { code: 'storage-unavailable', message: 'You must be logged in' } }
      const { data, error } = await supabase.storage.from('app-attachments').download(`${userId}/${id}`)
      if (error) throw error
      return { ok: true, data: data ?? undefined }
    } catch (error) {
      return { ok: false, error: { code: 'storage-unavailable', message: error instanceof Error ? error.message : 'Unable to download attachment' } }
    }
  },

  async writeAttachment(id: string, value: Blob): Promise<DataResult<void>> {
    try {
      const supabase = getSupabaseBrowserClient()
      const userId = await getCurrentUserId()
      if (!userId) return { ok: false, error: { code: 'storage-unavailable', message: 'You must be logged in' } }
      const { error } = await supabase.storage.from('app-attachments').upload(`${userId}/${id}`, value, {
        upsert: true,
        contentType: value.type || 'application/octet-stream',
      })
      if (error) throw error
      return { ok: true, data: undefined }
    } catch (error) {
      return { ok: false, error: { code: 'persistence-failed', message: error instanceof Error ? error.message : 'Unable to upload attachment' } }
    }
  },

  async deleteAttachment(id: string): Promise<DataResult<void>> {
    try {
      const supabase = getSupabaseBrowserClient()
      const userId = await getCurrentUserId()
      if (!userId) return { ok: false, error: { code: 'storage-unavailable', message: 'You must be logged in' } }
      const { error } = await supabase.storage.from('app-attachments').remove([`${userId}/${id}`])
      if (error) throw error
      return { ok: true, data: undefined }
    } catch (error) {
      return { ok: false, error: { code: 'persistence-failed', message: error instanceof Error ? error.message : 'Unable to delete attachment' } }
    }
  },

  async clearAttachments(): Promise<DataResult<void>> {
    try {
      const supabase = getSupabaseBrowserClient()
      const userId = await getCurrentUserId()
      if (!userId) return { ok: false, error: { code: 'storage-unavailable', message: 'You must be logged in' } }
      const { data } = await supabase.storage.from('app-attachments').list(userId)
      if (data?.length) {
        const { error } = await supabase.storage.from('app-attachments').remove(data.map((item) => `${userId}/${item.name}`))
        if (error) throw error
      }
      return { ok: true, data: undefined }
    } catch (error) {
      return { ok: false, error: { code: 'persistence-failed', message: error instanceof Error ? error.message : 'Unable to clear attachments' } }
    }
  },

  async reset(): Promise<DataResult<void>> {
    return { ok: false, error: { code: 'reset-failed', message: 'Production demo reset is disabled' } }
  },
}

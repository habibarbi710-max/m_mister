import type { ApiResult, AuthCredential, AvailabilityVote, BacSection, ClassGroup, ClassLogEntry, ContentTrashItem, Exam, ExamInput, GroupAnnouncement, GroupAssessment, GroupAttendance, GroupContentLink, GroupEnrollment, GroupPayment, GroupRescheduleRequest, HomeworkAssignment, HomeworkFile, HomeworkSubmission, Lesson, LessonAnswer, LessonDraft, LessonInput, LessonQuestion, LessonRating, LessonVideoPosition, LiveAttendance, LiveQuestion, LiveSession, LiveSessionChanges, LiveSessionInput, MessagingBlock, ModerationAction, ModuleInput, Payment, PlatformSettings, PrivateMessage, QuizResult, RelationshipSettings, Report, ReorderLessonInput, ReorderModuleInput, ReorderSubjectInput, SchedulePoll, SchedulePollVote, Section, Subject, SubjectInput, StudentActivity, StudentGrade, StudentSubjectEnrollment, Subscription, SubscriptionScope, TeacherAnnouncement, TeacherAssignment, TeacherEngagement, TeacherFollow, TeacherProfile, User, WeeklySlot } from '@/types'
import { liveAttendanceSchema, liveQuestionSchema, liveSessionInputSchema, liveSessionSchema } from '@/lib/live-schemas'
import { liveSessionStart } from '@/lib/live-time'
import { dataProvider } from '@/lib/data/config'
import type { DataKey, DataValue, LanguagePreference, Notification } from '@/lib/data/provider'
import { calculateQuizScore } from '@/lib/quiz-score'
import { parseVideoUrl } from '@/lib/video/parse'
import { calculateGroupAverage, getGradeDistribution } from '@/lib/grades'
import { generateWeeklySessionDates, hasSessionConflict, privateStudentName, rankWeeklySlots, suggestBestWeeklySlot } from '@/lib/group-scheduling'

async function read<K extends DataKey>(key: K): Promise<DataValue<K>> {
  const result = await dataProvider.read(key)
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

async function write<K extends DataKey>(key: K, value: DataValue<K>): Promise<void> {
  const result = await dataProvider.write(key, value)
  if (!result.ok) throw new Error(result.error.message)
}

export const MAX_STUDENT_MESSAGES_PER_HOUR = 10

export function maskContactInfo(value: string): { text: string; masked: boolean } {
  let masked = false
  const replace = (text: string, pattern: RegExp) => text.replace(pattern, () => {
    masked = true
    return '[coordonnées masquées]'
  })
  let text = replace(value, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)
  text = replace(text, /\b(?:https?:\/\/|www\.)[^\s]+|\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|tn|fr|edu)(?:\/[^\s]*)?/gi)
  text = replace(text, /(?:\+?\d[\d\s().-]{7,}\d)/g)
  return { text, masked }
}

export async function getAuthCredentials(): Promise<AuthCredential[]> { return read('accounts') }
export async function saveAuthCredentials(accounts: AuthCredential[]): Promise<void> { await write('accounts', accounts) }
export async function addMissingDemoUsers(seedUsers: User[]): Promise<void> {
  const users = await read('users')
  const existingIds = new Set(users.map((user) => user.id))
  const missing = seedUsers.filter((user) => !existingIds.has(user.id))
  if (missing.length) await write('users', [...users, ...missing])
}
export async function saveLanguagePreference(language: LanguagePreference): Promise<void> { await write('lang', language) }
export async function getThemePreference(): Promise<'light' | 'dark'> { return read('theme') }
export async function saveThemePreference(theme: 'light' | 'dark'): Promise<void> { await write('theme', theme) }

async function notifyUser(
  userId: string,
  type: Notification['type'],
  title: string,
  message: string,
  href: string,
): Promise<void> {
  const notification: Notification = {
    id: `notification-${crypto.randomUUID()}`,
    userId,
    type,
    title,
    message,
    href,
    createdAt: new Date().toISOString(),
  }
  await write('notifications', [notification, ...await read('notifications')])
}

async function notifyStudents(
  type: Notification['type'],
  title: string,
  message: string,
  href: string,
): Promise<void> {
  const students = (await read('users')).filter((user) => user.role === 'student' && !user.blocked)
  const createdAt = new Date().toISOString()
  const notifications = students.map((student) => ({
    id: `notification-${crypto.randomUUID()}`,
    userId: student.id,
    type,
    title,
    message,
    href,
    createdAt,
  } satisfies Notification))
  await write('notifications', [...notifications, ...await read('notifications')])
}

export async function getNotifications(): Promise<Notification[]> {
  const user = await getCurrentUser()
  if (!user) return []
  return (await read('notifications'))
    .filter((notification) => notification.userId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function markNotificationRead(id: string): Promise<ApiResult<Notification>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You must be logged in' }
  const notifications = await read('notifications')
  const notification = notifications.find((item) => item.id === id && item.userId === user.id)
  if (!notification) return { ok: false, error: 'Notification not found' }
  const updated = { ...notification, readAt: new Date().toISOString() }
  await write('notifications', notifications.map((item) => item.id === id ? updated : item))
  return { ok: true, data: updated }
}

export async function searchLessons(query: string): Promise<Lesson[]> {
  const normalized = query.trim().toLocaleLowerCase('fr-FR')
  if (normalized.length < 2) return []
  const catalog = await getSubjects()
  const matches = catalog.flatMap((subject) => subject.chapters.flatMap((chapter) => chapter.lessons))
    .filter((lesson) => `${lesson.title} ${lesson.summary}`.toLocaleLowerCase('fr-FR').includes(normalized))
  const visible = await Promise.all(matches.map((lesson) => getLesson(lesson.id)))
  return visible.filter((lesson): lesson is Lesson => lesson !== undefined).slice(0, 8)
}

export async function resetDemoData(): Promise<ApiResult<void>> {
  if (process.env.NODE_ENV !== 'development') return { ok: false, error: 'Demo data can only be reset in development' }
  const currentUser = await getCurrentUser()
  if (currentUser?.role !== 'admin') return { ok: false, error: 'Admin permission required' }
  const reset = await dataProvider.reset()
  if (!reset.ok) return { ok: false, error: reset.error.message }
  await write('user', currentUser)
  return { ok: true, data: undefined }
}

const seedNames: Record<string, string> = {
  'student-1': 'Amna Ayari',
  'teacher-1': 'Meriem Ben Salah',
  'admin-1': 'Administration',
}

function normalizeSeedUser(user: User): User {
  const name = seedNames[user.id]
  return name ? { ...user, name } : user
}

function validFileSignature(encoded: string, type: string): boolean {
  try {
    const bytes = atob(encoded)
    if (type === 'application/pdf') return bytes.startsWith('%PDF-')
    if (type === 'image/png') return bytes.startsWith('\x89PNG\r\n\x1a\n')
    if (type === 'image/jpeg') return bytes.length >= 3 && bytes.charCodeAt(0) === 0xff && bytes.charCodeAt(1) === 0xd8 && bytes.charCodeAt(2) === 0xff
    if (type === 'image/webp') return bytes.length >= 12 && bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP'
    return false
  } catch {
    return false
  }
}

function hideLessonDetails(lesson: Lesson): Lesson {
  return {
    ...lesson,
    videoUrl: '',
    videos: [],
    summary: '',
    pdfUrl: '',
    exercises: [],
    quiz: { ...lesson.quiz, questions: [] },
  }
}

const allLessons = async (): Promise<Lesson[]> => {
  const [catalog, saved, deletedIds] = await Promise.all([read('subjects'), read('lessons'), read('deletedLessons')])
  const deleted = new Set(deletedIds)
  const lessons = new Map(catalog.flatMap((subject) => subject.chapters).flatMap((chapter) => chapter.lessons)
    .filter((lesson) => !deleted.has(lesson.id)).map((lesson) => [lesson.id, lesson]))
  for (const lesson of saved) {
    if (!deleted.has(lesson.id)) lessons.set(lesson.id, lesson)
  }
  return [...lessons.values()]
}

function lessonFromDraft(draft: LessonDraft): Lesson {
  const { data } = draft
  const now = draft.updatedAt
  return {
    ...data,
    id: draft.lessonId,
    ownerId: draft.ownerId,
    teacherId: draft.ownerId,
    subjectId: data.subjectId,
    chapterId: data.chapterId,
    status: 'draft',
    order: data.order,
    createdAt: data.createdAt ?? now,
    updatedAt: now,
    views: 0,
    exercises: data.exercises.map((exercise, index) => ({
      ...exercise,
      id: exercise.id ?? `${draft.lessonId}-exercise-${index}`,
      ownerId: draft.ownerId,
      status: 'draft',
      order: exercise.order ?? index,
      createdAt: exercise.createdAt ?? now,
      updatedAt: exercise.updatedAt ?? now,
    })),
    quiz: {
      ...data.quiz,
      id: data.quiz.id ?? `${draft.lessonId}-quiz`,
      ownerId: draft.ownerId,
      status: 'draft',
      order: data.quiz.order ?? 0,
      createdAt: data.quiz.createdAt ?? now,
      updatedAt: data.quiz.updatedAt ?? now,
    },
  }
}

export async function getSubjects(): Promise<Subject[]> {
  const [catalog, existingLessons, draftRows] = await Promise.all([read('subjects'), allLessons(), read('lessonDrafts')])
  const user = await getCurrentUser()
  const student = user?.role !== 'admin' && user?.role !== 'teacher'
  const drafts = user?.role === 'admin'
    ? draftRows.map(lessonFromDraft)
    : user?.role === 'teacher'
      ? draftRows.filter((draft) => draft.ownerId === user.id).map(lessonFromDraft)
      : []
  const lessonMap = new Map([...existingLessons, ...drafts].map((lesson) => [lesson.id, lesson]))
  const visibleLessonIds = user?.role === 'student'
    ? new Set((await Promise.all(existingLessons.map(async (lesson) =>
      await studentCanAccessLesson(user, lesson) ? lesson.id : undefined))).filter((id): id is string => Boolean(id)))
    : undefined
  return catalog
    .filter((subject) => !student || subject.status === 'published')
    .sort((a, b) => a.order - b.order)
    .map((subject) => ({
      ...subject,
      chapters: subject.chapters
        .filter((chapter) => !student || chapter.status === 'published')
        .map((chapter) => ({
          ...chapter,
          lessons: [...lessonMap.values()]
            .filter((lesson) => lesson.subjectId === subject.id && lesson.chapterId === chapter.id)
            .filter((lesson) => !student || lesson.status === 'published')
            .filter((lesson) => !visibleLessonIds || visibleLessonIds.has(lesson.id))
            .sort((a, b) => a.order - b.order)
            .map((lesson) => {
              if (user?.role === 'teacher' && lesson.ownerId !== user.id) return hideLessonDetails(lesson)
              return includeLegacyVideo(lesson)
            }),
        }))
        .sort((a, b) => a.order - b.order),
    }))
}
export async function getSubject(id: string): Promise<Subject | undefined> { return (await getSubjects()).find((subject) => subject.id === id) }
export async function getLesson(id: string): Promise<Lesson | undefined> {
  const user = await getCurrentUser()
  let lesson = (await allLessons()).find((item) => item.id === id)
  if (user?.role === 'teacher' || user?.role === 'admin') {
    const draft = (await read('lessonDrafts')).find((item) => item.lessonId === id && (user.role === 'admin' || item.ownerId === user.id))
    if (draft) lesson = lessonFromDraft(draft)
  }
  if (!lesson) return undefined
  const educator = user?.role === 'admin' || user?.role === 'teacher' && lesson.ownerId === user.id
  const subject = (await read('subjects')).find((item) => item.id === lesson.subjectId)
  const chapter = subject?.chapters.find((item) => item.id === lesson.chapterId)
  if (!subject || !chapter) return undefined
  if (user?.role === 'student' && (subject.status !== 'published' || chapter.status !== 'published' || lesson.status !== 'published')) return undefined
  if (user?.role === 'teacher' && !educator) return undefined
  if (user?.role === 'admin') return includeLegacyVideo(lesson)
  if (user?.role === 'student' && !await studentCanAccessLesson(user, lesson)) return undefined
  return includeLegacyVideo(lesson)
}
export async function getExams(): Promise<Exam[]> {
  const rows = await read('exams')
  const user = await getCurrentUser()
  if (user?.role === 'admin') return rows
  if (user?.role === 'teacher') return rows.filter((exam) => exam.ownerId === user.id)
  const catalog = await read('subjects')
  const visible = rows.filter((exam) => exam.status === 'published'
    && catalog.some((subject) => subject.id === exam.subjectId && subject.status === 'published'))
  if (!(await getSettings()).paymentsEnabled) return visible
  if (await hasSubscriptionAccess('platform')) return visible
  return visible.map((exam) => ({ ...exam, correction: '' }))
}
export async function getLiveSessions(): Promise<LiveSession[]> {
  const user = await getCurrentUser()
  const sessions = await readLiveSessions()
  if (user?.role === 'teacher') return sessions.filter((session) => session.teacherId === user.id)
  if (user?.role === 'admin') return sessions
  const visible = await Promise.all(sessions.map(async (session) => {
    if (session.groupId) {
      return user?.role === 'student' && await hasGroupContentAccess(user.id, session.groupId)
    }
    return user?.role === 'student' && await hasSubscriptionAccess('platform')
  }))
  return sessions.filter((session, index) => visible[index])
}

export async function getLiveSession(id: string): Promise<LiveSession | undefined> {
  return (await getLiveSessions()).find((session) => session.id === id)
}

export async function canJoinLiveSession(sessionId: string): Promise<boolean> {
  const user = await getCurrentUser()
  const session = (await readLiveSessions()).find((item) => item.id === sessionId)
  if (!user || !session) return false
  if (user.role === 'admin') return false
  if (user.role === 'teacher') return user.id === session.teacherId
  if (session.groupId) return hasGroupContentAccess(user.id, session.groupId)
  return hasSubscriptionAccess('platform')
}

async function readLiveSessions(): Promise<LiveSession[]> {
  const saved = await read('liveSessions') as unknown[]
  if (!Array.isArray(saved)) throw new Error('Données de séances en direct invalides')
  const sessions = saved.map((value) => {
    if (typeof value !== 'object' || value === null) throw new Error('Donnée de séance en direct invalide')
    const row = value as Record<string, unknown>
    const legacy = !('status' in row)
    const normalized = legacy ? {
      id: row.id,
      title: row.title,
      description: '',
      subjectId: 'math',
      teacherId: row.teacherId,
      date: row.date,
      startTime: row.startTime ?? row.time,
      durationMinutes: 60,
      provider: row.meetingUrl ? 'external' : 'livekit',
      externalUrl: row.meetingUrl || undefined,
      status: row.cancelled ? 'cancelled' : 'scheduled',
      replayUrl: row.replay || undefined,
      resources: [],
      createdAt: new Date().toISOString(),
    } : row
    const parsed = liveSessionSchema.safeParse(normalized)
    if (!parsed.success) throw new Error('Données de séances en direct endommagées')
    return parsed.data
  })
  if (saved.some((value) => typeof value === 'object' && value !== null && !('status' in value))) {
    await write('liveSessions', sessions)
  }
  return sessions
}
export async function getCurrentUser(): Promise<User | null> {
  const session = await read('user')
  if (!session) return null
  const account = (await read('users')).find((user) => user.id === session.id)
  if (account?.blocked) return null
  return normalizeSeedUser(account ?? session)
}
export async function signIn(identifier: string): Promise<User> {
  const normalized = identifier.trim().toLowerCase()
  const matches = (item: User) => item.email.toLowerCase() === normalized || item.phone.replace(/\s/g, '').toLowerCase() === normalized.replace(/\s/g, '')
  const match = (await read('users')).find(matches)
  if (!match) throw new Error('Account not found')
  if (match.blocked) throw new Error('This account is blocked')
  const user = normalizeSeedUser(match)
  await write('user', user)
  return user
}
export async function registerUser(user: User): Promise<User> {
  if (user.role !== 'student' || !user.name.trim() || (!user.email.trim() && !user.phone.trim())) throw new Error('Invalid student account')
  const users = await read('users')
  if (users.some((item) => (user.email && item.email.toLowerCase() === user.email.toLowerCase())
    || (user.phone && item.phone.replace(/\s/g, '') === user.phone.replace(/\s/g, '')))) throw new Error('Account already exists')
  await write('users', [...users.filter((item) => item.id !== user.id), user])
  await write('user', user)
  return user
}
export async function signOut(): Promise<void> { await write('user', null) }
export async function updateProfile(user: User): Promise<User> {
  const current = await getCurrentUser()
  if (!current || current.id !== user.id) throw new Error('You can only update your own profile')
  if (user.role !== current.role || user.name.trim().length < 2 || !/^\+?[\d\s()-]{8,}$/.test(user.phone.trim())) throw new Error('Invalid profile')
  const users = await read('users')
  await write('users', users.map((item) => item.id === user.id ? user : item))
  const credentials = await getAuthCredentials()
  await saveAuthCredentials(credentials.map((item) => item.user.id === user.id ? { ...item, user } : item))
  await write('user', user)
  return user
}

export async function getCompletedLessons(): Promise<string[]> {
  const user = await getCurrentUser()
  return user?.role === 'student' ? read(`completed:${user.id}`) : []
}
export async function getLastViewedLesson(): Promise<string | null> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'student') return null
  const id = await read(`lastViewed:${user.id}`)
  return id && await getLesson(id) ? id : null
}
export async function completeLesson(id: string): Promise<string[]> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') throw new Error('Student permission required')
  const lesson = await getLesson(id)
  if (!lesson) throw new Error('Lesson not available')
  const ids = await getCompletedLessons()
  const next = ids.includes(id) ? ids : [...ids, id]
  await write(`completed:${user.id}`, next)
  if (!ids.includes(id)) {
    await recordStudentActivity(user.id, lesson, 'lesson-completed')
    await refreshTeacherEngagement(lesson.ownerId, 0, 1)
  }
  return next
}
export async function getQuizResults(): Promise<QuizResult[]> {
  const user = await getCurrentUser()
  if (user?.role === 'teacher' || user?.role === 'admin') return []
  return read(`quizResults:${user?.id ?? 'anonymous'}`)
}
export async function submitQuizResult(title: string, lessonId: string, answers: number[] = []): Promise<QuizResult[]> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') throw new Error('Student permission required')
  const lesson = await getLesson(lessonId)
  if (!lesson) throw new Error('Lesson not available')
  if (answers.length !== lesson.quiz.questions.length
    || answers.some((answer, index) => !Number.isInteger(answer) || answer < 0 || answer >= lesson.quiz.questions[index].choices.length)) {
    throw new Error('Quiz answers are invalid')
  }
  const score = calculateQuizScore(lesson.quiz.questions, answers).percentage
  const results = await getQuizResults()
  const next = [{ id: `result-${Date.now()}`, lessonId, title, score, date: new Date().toISOString(), answers }, ...results]
  await write(`quizResults:${user.id}`, next)
  const metrics = await read('quizMetrics')
  if (lessonId) await write('quizMetrics', [...metrics, { lessonId, score }])
  await recordStudentActivity(user.id, lesson, 'quiz')
  return next
}

export async function getLessonPerformance(lessonId: string): Promise<{ attempts: number; averageScore: number | null }> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { attempts: 0, averageScore: null }
  const lessons = await getTeacherLessons()
  if (user.role === 'teacher' && !lessons.some((lesson) => lesson.id === lessonId)) return { attempts: 0, averageScore: null }
  const rows = (await read('quizMetrics')).filter((item) => item.lessonId === lessonId)
  return { attempts: rows.length, averageScore: rows.length ? Math.round(rows.reduce((sum, item) => sum + item.score, 0) / rows.length) : null }
}

export async function createPaymentRequest(plan: string, amount: number, receipt: string, receiptType = 'image/jpeg'): Promise<ApiResult<Payment>> {
  if (!(await getSettings()).paymentsEnabled) return { ok: false, error: 'Les paiements sont désactivés.' }
  if (!/^image\/(png|jpeg|webp)$|^application\/pdf$/.test(receiptType)) return { ok: false, error: 'Unsupported receipt format' }
  const receiptMatch = receipt.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/)
  if (!receiptMatch || receiptMatch[1] !== receiptType) return { ok: false, error: 'Receipt must be a valid encoded image or PDF' }
  const decodedSize = Math.floor(receiptMatch[2].length * 3 / 4) - (receiptMatch[2].endsWith('==') ? 2 : receiptMatch[2].endsWith('=') ? 1 : 0)
  if (decodedSize > 3 * 1024 * 1024) return { ok: false, error: 'Receipt exceeds the 3 MB limit' }
  if (!validFileSignature(receiptMatch[2], receiptType)) return { ok: false, error: 'Receipt must be a valid encoded image or PDF' }
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You must be logged in' }
  if (user.role !== 'student') return { ok: false, error: 'Student permission required' }
  if (user.blocked) return { ok: false, error: 'This account is blocked' }
  const settings = await getSettings()
  const planPrices: Record<string, number> = {
    monthly: settings.monthlyPrice,
    quarterly: settings.monthlyPrice * 3,
    annual: settings.monthlyPrice * 10,
  }
  if (planPrices[plan] !== amount) return { ok: false, error: 'Selected plan price is invalid' }
  const payment: Payment = {
    id: `pay-${Date.now()}`, userId: user.id, userName: user.name, phone: user.phone, plan, amount,
    submittedAt: new Date().toISOString().slice(0, 10), status: 'Pending', receipt, receiptType,
  }
  await write('payments', [payment, ...await read('payments')])
  const subscription = await getSubscription()
  if (subscription.status !== 'Active') await write(`subscription:${user.id}`, { status: 'Pending', plan })
  return { ok: true, data: payment }
}
export async function getPayments(): Promise<Payment[]> {
  const user = await getCurrentUser()
  return user?.role === 'admin' && (await getSettings()).paymentsEnabled ? read('payments') : []
}
export async function getMyPayments(): Promise<Payment[]> {
  const user = await getCurrentUser()
  return user?.role === 'student' && (await getSettings()).paymentsEnabled
    ? (await read('payments')).filter((payment) => payment.userId === user.id) : []
}
export async function approvePayment(id: string, approved: boolean, reason = ''): Promise<ApiResult<Payment[]>> {
  const user = await getCurrentUser()
  if (user?.role !== 'admin') return { ok: false, error: 'Admin permission required' }
  if (!(await getSettings()).paymentsEnabled) return { ok: false, error: 'Les paiements sont désactivés.' }
  if (!approved && reason.trim().length < 5) return { ok: false, error: 'A rejection reason of at least five characters is required' }
  const rows = await getPayments()
  const target = rows.find((payment) => payment.id === id)
  if (!target || target.status !== 'Pending') return { ok: false, error: 'Pending payment not found' }
  const next = rows.map((payment) => payment.id === id ? {
    ...payment,
    status: approved ? 'Approved' as const : 'Rejected' as const,
    rejectionReason: approved ? undefined : reason,
  } : payment)
  await write('payments', next)
  const payment = next.find((item) => item.id === id)
  if (payment && approved) {
    const currentSubscription = await read(`subscription:${payment.userId}`)
    await write(`subscription:${payment.userId}`, {
      status: 'Active',
      plan: payment.plan,
      expiresAt: subscriptionExpiry(payment.plan, currentSubscription),
    })
  }
  if (payment && !approved) {
    const currentSubscription = await read(`subscription:${payment.userId}`)
    if (currentSubscription.status !== 'Active' || isSubscriptionExpired(currentSubscription.expiresAt)) {
      await write(`subscription:${payment.userId}`, { status: 'None' })
    }
  }
  if (payment) {
    await notifyUser(
      payment.userId,
      approved ? 'payment-approved' : 'payment-rejected',
      approved ? 'Paiement validé' : 'Paiement refusé',
      approved ? 'Votre abonnement est maintenant actif.' : `Votre paiement a été refusé. Motif : ${reason.trim()}`,
      '/pricing',
    )
  }
  return { ok: true, data: next }
}

function subscriptionExpiry(plan: string, current?: Subscription): string {
  const months = plan === 'quarterly' ? 3 : plan === 'annual' ? 10 : 1
  const today = current?.status === 'Active' && current.expiresAt && !isSubscriptionExpired(current.expiresAt)
    ? new Date(`${current.expiresAt}T00:00:00.000Z`)
    : new Date(`${todayInTunis()}T00:00:00.000Z`)
  const targetMonth = today.getUTCMonth() + months
  const target = new Date(Date.UTC(today.getUTCFullYear(), targetMonth, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(today.getUTCDate(), lastDay))
  return target.toISOString().slice(0, 10)
}

function todayInTunis(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Tunis',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

function isSubscriptionExpired(expiresAt?: string): boolean {
  return Boolean(expiresAt && expiresAt < todayInTunis())
}

export async function getSubscription(): Promise<Subscription> {
  const user = await getCurrentUser()
  const subscription = await read(`subscription:${user?.id ?? 'anonymous'}`)
  if (subscription.status === 'Active' && isSubscriptionExpired(subscription.expiresAt)) {
    const expired: Subscription = { ...subscription, status: 'Expired' }
    await write(`subscription:${user?.id ?? 'anonymous'}`, expired)
    return { ...expired, scope: expired.scope ?? 'platform' }
  }
  return { ...subscription, scope: subscription.scope ?? 'platform' }
}

export async function hasSubscriptionAccess(
  requestedScope: SubscriptionScope,
  _teacherId?: string,
  _subjectId?: string,
): Promise<boolean> {
  const subscription = await getSubscription()
  return requestedScope === 'platform' && (subscription.scope ?? 'platform') === 'platform'
    && subscription.status === 'Active'
}

export async function hasAcceptedGroupEnrollment(studentId: string, groupId: string): Promise<boolean> {
  return (await read('groupEnrollments')).some((enrollment) =>
    enrollment.studentId === studentId && enrollment.groupId === groupId && enrollment.status === 'accepté')
}

async function groupPaymentIsCurrent(studentId: string, groupId: string): Promise<boolean> {
  const group = (await read('classGroups')).find((item) => item.id === groupId)
  if (!group || group.monthlyPrice === null || group.monthlyPrice === 0) return Boolean(group)
  const today = todayInTunis()
  const currentPeriod = today.slice(0, 7)
  const currentMonthStart = new Date(`${currentPeriod}-01T00:00:00.000Z`)
  currentMonthStart.setUTCMonth(currentMonthStart.getUTCMonth() - 1)
  const previousPeriod = currentMonthStart.toISOString().slice(0, 7)
  const graceDays = (await getSettings()).gracePeriodDays ?? 7
  const dayOfMonth = Number(today.slice(8, 10))
  return (await read('groupPayments')).some((payment) =>
    payment.studentId === studentId && payment.groupId === groupId && payment.status === 'payé'
    && (payment.period === currentPeriod || payment.period === previousPeriod && dayOfMonth <= graceDays))
}

async function hasGroupContentAccess(studentId: string, groupId: string): Promise<boolean> {
  if (!await hasAcceptedGroupEnrollment(studentId, groupId)) return false
  const settings = await getSettings()
  return !settings.paymentsEnabled || groupPaymentIsCurrent(studentId, groupId)
}

async function studentCanAccessLesson(user: User, lesson: Lesson): Promise<boolean> {
  if (lesson.isFree) return true
  const [groups, links, enrollments] = await Promise.all([
    read('classGroups'),
    read('groupContentLinks'),
    read('groupEnrollments'),
  ])
  const eligibleGroupIds = new Set(enrollments
    .filter((enrollment) => enrollment.studentId === user.id && enrollment.status === 'accepté')
    .map((enrollment) => enrollment.groupId))
  const groupIds = links
    .filter((link) => link.published && link.lessonIds.includes(lesson.id) && eligibleGroupIds.has(link.groupId))
    .map((link) => link.groupId)
    .filter((groupId) => groups.some((group) => group.id === groupId && group.subjectId === lesson.subjectId))
  for (const groupId of groupIds) {
    if (await hasGroupContentAccess(user.id, groupId)) return true
  }
  return false
}

export async function incrementLessonViews(id: string): Promise<void> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') return
  if (!await getLesson(id)) throw new Error('Lesson not available')
  const views = await read('lessonViews')
  views[id] = (views[id] ?? 0) + 1
  await write('lessonViews', views)
  await write(`lastViewed:${user.id}`, id)
}

export async function getVideoPosition(videoId: string): Promise<LessonVideoPosition | null> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') return null
  return read(`videoPosition:${user.id}:${videoId}`)
}

export async function saveVideoPosition(
  lessonId: string,
  videoId: string,
  seconds: number,
): Promise<ApiResult<LessonVideoPosition>> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') return { ok: false, error: 'Student permission required' }
  const lesson = await getLesson(lessonId)
  const video = lesson?.videos.find((item) => item.id === videoId)
  if (!lesson || !video || !Number.isFinite(seconds) || seconds < 0
    || video.durationSeconds > 0 && seconds > video.durationSeconds + 2) {
    return { ok: false, error: 'La position de lecture est invalide.' }
  }
  const position: LessonVideoPosition = { videoId, seconds, updatedAt: timestamp() }
  const previous = await read(`videoPosition:${user.id}:${videoId}`)
  await write(`videoPosition:${user.id}:${videoId}`, position)
  await recordStudentActivity(user.id, lesson, 'video')
  if (seconds > (previous?.seconds ?? 0)) {
    await refreshTeacherEngagement(lesson.ownerId, (seconds - (previous?.seconds ?? 0)) / 60)
  }
  const mainVideo = [...lesson.videos].sort((a, b) => a.order - b.order)[0]
  if (mainVideo?.id === videoId && video.durationSeconds > 0 && seconds / video.durationSeconds >= 0.9) {
    await completeLesson(lessonId)
  }
  return { ok: true, data: position }
}

export async function blockUser(id: string, blocked: boolean): Promise<ApiResult<User[]>> {
  const admin = await getCurrentUser()
  if (admin?.role !== 'admin') return { ok: false, error: 'Admin permission required' }
  const users = await read('users')
  const next = users.map((user) => user.id === id ? { ...user, blocked } : user)
  await write('users', next)
  const updatedUser = next.find((user) => user.id === id)
  if (updatedUser) {
    const credentials = await getAuthCredentials()
    await saveAuthCredentials(credentials.map((item) => item.user.id === id ? { ...item, user: updatedUser } : item))
  }
  return { ok: true, data: next }
}
export async function getUsers(): Promise<User[]> {
  const admin = await getCurrentUser()
  return admin?.role === 'admin' ? (await read('users')).map(normalizeSeedUser) : []
}

export async function createLiveSession(session: LiveSessionInput): Promise<ApiResult<LiveSession>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const parsed = liveSessionInputSchema.safeParse(session)
  if (!parsed.success) return { ok: false, error: 'Invalid live session details' }
  if (user.role === 'teacher') {
    const assignments = await read('teacherAssignments')
    if (!assignments[user.id]?.includes(parsed.data.subjectId)) return { ok: false, error: 'This subject is not assigned to your account' }
  }
  if (!(await read('subjects')).some((subject) => subject.id === parsed.data.subjectId)) {
    return { ok: false, error: 'Select a valid subject' }
  }
  const nextParsed = liveSessionSchema.safeParse({
    ...parsed.data,
    teacherId: user.id,
    id: `live-${crypto.randomUUID()}`,
    status: 'scheduled',
    createdAt: new Date().toISOString(),
  })
  if (!nextParsed.success) return { ok: false, error: 'Invalid live session details' }
  const next = nextParsed.data
  await write('liveSessions', [next, ...await readLiveSessions()])
  return { ok: true, data: next }
}

export async function updateLiveSession(id: string, changes: LiveSessionChanges): Promise<ApiResult<LiveSession>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const sessions = await readLiveSessions()
  const current = sessions.find((session) => session.id === id)
  if (!current || (user.role !== 'admin' && current.teacherId !== user.id)) return { ok: false, error: 'You can only edit your own sessions' }
  const next = { ...current, ...changes }
  if (!liveSessionSchema.safeParse(next).success) return { ok: false, error: 'Invalid live session details' }
  await write('liveSessions', [next, ...sessions.filter((session) => session.id !== id)])
  return { ok: true, data: next }
}

export async function setLiveSessionStatus(id: string, status: LiveSession['status']): Promise<ApiResult<LiveSession>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const session = (await readLiveSessions()).find((item) => item.id === id)
  if (!session || (user.role === 'teacher' && session.teacherId !== user.id)) return { ok: false, error: 'You can only manage your own sessions' }
  if (session.status === 'cancelled' || (session.status === 'ended' && status !== 'ended')) return { ok: false, error: 'This session can no longer be started' }
  const startsAt = liveSessionStart(session).getTime()
  const now = Date.now()
  if (status === 'live' && (session.status !== 'scheduled' || now < startsAt - 15 * 60_000 || now > startsAt + session.durationMinutes * 60_000)) {
    return { ok: false, error: 'La salle ouvre 15 minutes avant le début et ferme à la fin de la séance.' }
  }
  if (status === 'ended' && session.status !== 'live') return { ok: false, error: 'Seule une séance en direct peut être terminée.' }
  const updated = await updateLiveSession(id, { status })
  if (updated.ok && status === 'live') {
    await notifyStudents('live-starting', 'Séance en direct', `La séance « ${session.title} » vient de commencer.`, `/live/${session.id}`)
  }
  return updated
}

export async function cancelLiveSession(id: string): Promise<ApiResult<LiveSession>> {
  return setLiveSessionStatus(id, 'cancelled')
}

export async function createWeeklyLiveSessions(session: LiveSessionInput, count = 8): Promise<ApiResult<LiveSession[]>> {
  if (!Number.isInteger(count) || count < 1 || count > 8) return { ok: false, error: 'Invalid repeat count' }
  const parsed = liveSessionInputSchema.safeParse(session)
  if (!parsed.success) return { ok: false, error: 'Invalid live session details' }
  const results: LiveSession[] = []
  for (let week = 0; week < count; week += 1) {
    const date = new Date(`${parsed.data.date}T00:00:00.000Z`)
    date.setUTCDate(date.getUTCDate() + week * 7)
    const result = await createLiveSession({ ...parsed.data, date: date.toISOString().slice(0, 10) })
    if (!result.ok) return result
    results.push(result.data)
  }
  return { ok: true, data: results }
}

async function readLiveQuestions(): Promise<LiveQuestion[]> {
  const rows = await read('liveQuestions') as unknown[]
  if (!Array.isArray(rows)) throw new Error('Données de questions invalides')
  return rows.map((row) => {
    const parsed = liveQuestionSchema.safeParse(row)
    if (!parsed.success) throw new Error('Données de questions endommagées')
    return parsed.data
  })
}

export async function getLiveQuestions(sessionId: string): Promise<LiveQuestion[]> {
  const user = await getCurrentUser()
  const session = (await readLiveSessions()).find((item) => item.id === sessionId)
  if (!session) return []
  if (user?.role === 'teacher' && user.id !== session.teacherId) return []
  if (user?.role !== 'admin' && user?.role !== 'teacher'
    && (user?.role !== 'student' || !await canJoinLiveSession(sessionId))) return []
  return (await readLiveQuestions()).filter((question) => question.sessionId === sessionId)
    .sort((a, b) => Number(a.answered) - Number(b.answered) || b.voterIds.length - a.voterIds.length || a.createdAt.localeCompare(b.createdAt))
}

export async function createLiveQuestion(sessionId: string, text: string): Promise<ApiResult<LiveQuestion>> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') return { ok: false, error: 'Student permission required' }
  if (!await canJoinLiveSession(sessionId)) return { ok: false, error: 'Une inscription acceptée à cette classe est nécessaire.' }
  if (!(await readLiveSessions()).some((session) => session.id === sessionId && session.status === 'live')) return { ok: false, error: 'Les questions sont accessibles pendant une séance en direct.' }
  const parsed = liveQuestionSchema.safeParse({
    id: `question-${crypto.randomUUID()}`,
    sessionId,
    studentId: user.id,
    text,
    createdAt: new Date().toISOString(),
    voterIds: [],
    answered: false,
  })
  if (!parsed.success) return { ok: false, error: 'Question invalide' }
  const question = parsed.data
  await write('liveQuestions', [question, ...await readLiveQuestions()])
  return { ok: true, data: question }
}

export async function voteLiveQuestion(questionId: string): Promise<ApiResult<LiveQuestion>> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') return { ok: false, error: 'Student permission required' }
  const questions = await readLiveQuestions()
  const question = questions.find((item) => item.id === questionId)
  if (!question) return { ok: false, error: 'Question not found' }
  if (!await canJoinLiveSession(question.sessionId)) return { ok: false, error: 'Une inscription acceptée à cette classe est nécessaire.' }
  if (!(await readLiveSessions()).some((session) => session.id === question.sessionId && session.status === 'live')) {
    return { ok: false, error: 'Votes are available during a live session' }
  }
  if (question.voterIds.includes(user.id)) return { ok: true, data: question }
  const updated = { ...question, voterIds: [...question.voterIds, user.id] }
  await write('liveQuestions', questions.map((item) => item.id === questionId ? updated : item))
  return { ok: true, data: updated }
}

export async function markLiveQuestionAnswered(questionId: string): Promise<ApiResult<LiveQuestion>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const questions = await readLiveQuestions()
  const question = questions.find((item) => item.id === questionId)
  const session = question && (await readLiveSessions()).find((item) => item.id === question.sessionId)
  if (!question || !session || (user.role === 'teacher' && session.teacherId !== user.id)) return { ok: false, error: 'You can only manage questions for your own sessions' }
  const updated = { ...question, answered: true }
  await write('liveQuestions', questions.map((item) => item.id === questionId ? updated : item))
  return { ok: true, data: updated }
}

export async function recordLiveAttendance(sessionId: string): Promise<ApiResult<LiveAttendance>> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') return { ok: false, error: 'Student permission required' }
  if (!await canJoinLiveSession(sessionId)) return { ok: false, error: 'Une inscription acceptée à cette classe est nécessaire.' }
  if (!(await readLiveSessions()).some((session) => session.id === sessionId && session.status === 'live')) return { ok: false, error: 'The live session has not started' }
  const attendance = (await read('liveAttendance') as unknown[]).map((row) => {
    const parsed = liveAttendanceSchema.safeParse(row)
    if (!parsed.success) throw new Error('Données de présence endommagées')
    return parsed.data
  })
  const existing = attendance.find((entry) => entry.sessionId === sessionId && entry.studentId === user.id)
  if (existing) return { ok: true, data: existing }
  const joined = { sessionId, studentId: user.id, joinedAt: new Date().toISOString() }
  const parsed = liveAttendanceSchema.safeParse(joined)
  if (!parsed.success) return { ok: false, error: 'Invalid attendance record' }
  await write('liveAttendance', [...attendance, parsed.data])
  return { ok: true, data: parsed.data }
}

export async function getLiveAttendanceCount(sessionId: string): Promise<number> {
  const user = await getCurrentUser()
  const session = (await readLiveSessions()).find((item) => item.id === sessionId)
  if (!session || (user?.role !== 'admin' && (user?.role !== 'teacher' || user.id !== session.teacherId))) return 0
  const rows = await read('liveAttendance') as unknown[]
  return rows.map((row) => {
    const parsed = liveAttendanceSchema.safeParse(row)
    if (!parsed.success) throw new Error('Données de présence endommagées')
    return parsed.data
  }).filter((entry) => entry.sessionId === sessionId).length
}

export async function getTeacherLessons(): Promise<Lesson[]> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return []
  const views = await read('lessonViews')
  const saved = await allLessons()
  const drafts = (await read('lessonDrafts'))
    .filter((draft) => user.role === 'admin' || draft.ownerId === user.id)
    .map(lessonFromDraft)
  const byId = new Map([...saved, ...drafts].map((lesson) => [lesson.id, lesson]))
  return [...byId.values()]
    .filter((lesson) => user.role === 'admin' || lesson.ownerId === user.id)
    .map((lesson) => ({ ...lesson, views: views[lesson.id] ?? lesson.views }))
}

function timestamp(): string {
  return new Date().toISOString()
}

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

function includeLegacyVideo(lesson: Lesson): Lesson {
  if (lesson.videos.length > 0 || !lesson.videoUrl) return lesson
  const parsed = parseVideoUrl(lesson.videoUrl)
  if (!parsed.ok) return lesson
  return {
    ...lesson,
    videos: [{
      id: `${lesson.id}-video-1`,
      title: 'Cours',
      provider: parsed.data.provider,
      url: parsed.data.url,
      durationSeconds: lesson.duration * 60,
      order: 0,
    }],
  }
}

function saveLessonIntoCatalog(catalog: Subject[], lesson: Lesson): Subject[] {
  return catalog.map((subject) => subject.id !== lesson.subjectId ? subject : ({
    ...subject,
    updatedAt: timestamp(),
    chapters: subject.chapters.map((chapter) => chapter.id !== lesson.chapterId ? chapter : ({
      ...chapter,
      updatedAt: timestamp(),
      lessons: [lesson, ...chapter.lessons.filter((item) => item.id !== lesson.id)],
    })),
  }))
}

export async function saveSubject(input: SubjectInput): Promise<ApiResult<Subject>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const catalog = await read('subjects')
  const existing = catalog.find((subject) => subject.id === input.id)
  const settings = await read('settings')
  if (!existing && user.role === 'teacher' && !settings.canCreateSubjects) return { ok: false, error: 'La création de matières est désactivée.' }
  if (existing && user.role === 'teacher' && !existing.ownerIds.includes(user.id)) return { ok: false, error: 'Vous pouvez modifier uniquement les matières dont vous êtes propriétaire.' }
  if (input.titleFr.trim().length < 2 || input.description.trim().length < 5 || input.sections.length === 0) {
    return { ok: false, error: 'Les informations de la matière sont invalides.' }
  }
  const now = timestamp()
  const subject: Subject = {
    id: existing?.id ?? input.id ?? makeId('subject'),
    order: existing?.order ?? input.order ?? catalog.length,
    title: input.titleFr.trim(),
    titleFr: input.titleFr.trim(),
    description: input.description.trim(),
    color: input.color,
    icon: input.icon,
    sections: input.sections,
    status: user.role === 'admin' ? input.status : input.status,
    ownerIds: user.role === 'admin'
      ? [...new Set(input.ownerIds?.length ? input.ownerIds : existing?.ownerIds ?? [user.id])]
      : existing?.ownerIds ?? [user.id],
    createdAt: existing?.createdAt ?? input.createdAt ?? now,
    updatedAt: now,
    chapters: existing?.chapters ?? [],
  }
  await write('subjects', existing
    ? catalog.map((item) => item.id === subject.id ? subject : item)
    : [...catalog, subject])
  return { ok: true, data: subject }
}

function duplicateLessonRecord(lesson: Lesson, subjectId: string, chapterId: string, ownerId: string, order: number): Lesson {
  const now = timestamp()
  return {
    ...lesson,
    id: makeId('lesson'),
    ownerId,
    teacherId: ownerId,
    subjectId,
    chapterId,
    status: 'draft',
    order,
    createdAt: now,
    updatedAt: now,
    videos: lesson.videos.map((video, index) => ({ ...video, id: makeId('video'), order: index })),
    exercises: lesson.exercises.map((exercise, index) => ({
      ...exercise, id: makeId('exercise'), ownerId, status: 'draft', order: index, createdAt: now, updatedAt: now,
    })),
    quiz: {
      ...lesson.quiz,
      id: makeId('quiz'),
      ownerId,
      status: 'draft',
      order: 0,
      createdAt: now,
      updatedAt: now,
      questions: lesson.quiz.questions.map((question) => ({ ...question, id: makeId('question') })),
    },
  }
}

export async function duplicateSubject(id: string): Promise<ApiResult<Subject>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const source = (await read('subjects')).find((subject) => subject.id === id)
  if (!source) return { ok: false, error: 'Matière introuvable.' }
  if (user.role === 'teacher' && !(await read('settings')).canCreateSubjects) return { ok: false, error: 'La création de matières est désactivée.' }
  const ownerId = user.role === 'teacher' ? user.id : source.ownerIds[0] ?? user.id
  const now = timestamp()
  const copyId = makeId('subject')
  const copy: Subject = {
    ...source,
    id: copyId,
    order: Math.max(-1, ...((await read('subjects')).map((subject) => subject.order))) + 1,
    title: `${source.title} (copie)`,
    titleFr: `${source.titleFr} (copie)`,
    ownerIds: [ownerId],
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    chapters: source.chapters.map((chapter, moduleIndex) => {
      const chapterId = makeId('module')
      const ownedLessons = user.role === 'admin'
        ? chapter.lessons
        : chapter.lessons.filter((lesson) => lesson.ownerId === user.id)
      return {
        ...chapter,
        id: chapterId,
        ownerId,
        status: 'draft',
        order: moduleIndex,
        createdAt: now,
        updatedAt: now,
        lessons: ownedLessons.map((lesson, lessonIndex) => duplicateLessonRecord(lesson, copyId, chapterId, ownerId, lessonIndex)),
      }
    }),
  }
  await write('subjects', [...await read('subjects'), copy])
  await write('lessons', [...copy.chapters.flatMap((chapter) => chapter.lessons), ...await read('lessons')])
  return { ok: true, data: copy }
}

export async function saveModule(subjectId: string, input: ModuleInput): Promise<ApiResult<Subject['chapters'][number]>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const catalog = await read('subjects')
  const subject = catalog.find((item) => item.id === subjectId)
  if (!subject) {
    return { ok: false, error: 'Matière introuvable ou inaccessible.' }
  }
  const existing = subject.chapters.find((chapter) => chapter.id === input.id)
  if (existing && user.role === 'teacher' && existing.ownerId !== user.id) return { ok: false, error: 'Vous pouvez modifier uniquement vos propres modules.' }
  if (input.title.trim().length < 2 || !Number.isInteger(input.order) || input.order < 0) return { ok: false, error: 'Les informations du module sont invalides.' }
  const now = timestamp()
  const chapter = {
    ...input,
    id: existing?.id ?? input.id ?? makeId('module'),
    title: input.title.trim(),
    description: input.description.trim(),
    ownerId: user.role === 'admin' ? input.ownerId ?? existing?.ownerId ?? user.id : existing?.ownerId ?? user.id,
    status: user.role === 'admin' ? input.status : input.status,
    createdAt: existing?.createdAt ?? input.createdAt ?? now,
    updatedAt: now,
    lessons: existing?.lessons ?? [],
  }
  const next = { ...subject, updatedAt: now, chapters: subject.chapters.some((item) => item.id === chapter.id)
    ? subject.chapters.map((item) => item.id === chapter.id ? chapter : item)
    : [...subject.chapters, chapter] }
  await write('subjects', catalog.map((item) => item.id === subjectId ? next : item))
  return { ok: true, data: chapter }
}

export async function reorderSubjects(changes: ReorderSubjectInput[]): Promise<ApiResult<Subject[]>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const catalog = await read('subjects')
  const byId = new Map(changes.map(({ subjectId, order }) => [subjectId, order]))
  const affected = catalog.filter((subject) => byId.has(subject.id))
  if (affected.length !== byId.size || changes.some((change) => !Number.isInteger(change.order) || change.order < 0)
    || user.role === 'teacher' && affected.some((subject) => !subject.ownerIds.includes(user.id))) {
    return { ok: false, error: 'Vous pouvez réordonner uniquement vos propres matières.' }
  }
  const updated = catalog.map((subject) => byId.has(subject.id)
    ? { ...subject, order: byId.get(subject.id)!, updatedAt: timestamp() }
    : subject).sort((a, b) => a.order - b.order)
  await write('subjects', updated)
  return { ok: true, data: updated }
}

export async function reorderModules(subjectId: string, changes: ReorderModuleInput[]): Promise<ApiResult<Subject['chapters']>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const catalog = await read('subjects')
  const subject = catalog.find((item) => item.id === subjectId)
  if (!subject) return { ok: false, error: 'Matière introuvable.' }
  const byId = new Map(changes.map(({ moduleId, order }) => [moduleId, order]))
  if (changes.some(({ moduleId }) => {
    const chapter = subject.chapters.find((item) => item.id === moduleId)
    return !chapter || user.role === 'teacher' && chapter.ownerId !== user.id
  })) return { ok: false, error: 'Vous pouvez réordonner uniquement vos propres modules.' }
  const chapters = subject.chapters.map((chapter) => byId.has(chapter.id)
    ? { ...chapter, order: byId.get(chapter.id)!, updatedAt: timestamp() }
    : chapter).sort((a, b) => a.order - b.order)
  await write('subjects', catalog.map((item) => item.id === subjectId ? { ...item, chapters } : item))
  return { ok: true, data: chapters }
}

export async function duplicateModule(subjectId: string, moduleId: string): Promise<ApiResult<Subject['chapters'][number]>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const catalog = await read('subjects')
  const subject = catalog.find((item) => item.id === subjectId)
  const source = subject?.chapters.find((chapter) => chapter.id === moduleId)
  if (!subject || !source) return { ok: false, error: 'Module introuvable.' }
  if (user.role === 'teacher' && source.ownerId !== user.id) return { ok: false, error: 'Vous pouvez dupliquer uniquement vos propres modules.' }
  const now = timestamp()
  const ownerId = user.role === 'teacher' ? user.id : source.ownerId
  const id = makeId('module')
  const copy = {
    ...source,
    id,
    title: `${source.title} (copie)`,
    ownerId,
    status: 'draft' as const,
    order: Math.max(-1, ...subject.chapters.map((chapter) => chapter.order)) + 1,
    createdAt: now,
    updatedAt: now,
    lessons: source.lessons
      .filter((lesson) => user.role === 'admin' || lesson.ownerId === user.id)
      .map((lesson, index) => duplicateLessonRecord(lesson, subjectId, id, ownerId, index)),
  }
  await write('subjects', catalog.map((item) => item.id === subjectId ? { ...item, chapters: [...item.chapters, copy] } : item))
  await write('lessons', [...copy.lessons, ...await read('lessons')])
  return { ok: true, data: copy }
}

export async function duplicateLesson(id: string): Promise<ApiResult<Lesson>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const source = (await allLessons()).find((lesson) => lesson.id === id)
  if (!source || user.role === 'teacher' && source.ownerId !== user.id) return { ok: false, error: 'Vous pouvez dupliquer uniquement vos propres leçons.' }
  const copy = duplicateLessonRecord(source, source.subjectId ?? '', source.chapterId ?? '', user.role === 'teacher' ? user.id : source.ownerId, source.order + 1)
  const catalog = await read('subjects')
  const nextCatalog = saveLessonIntoCatalog(catalog, copy)
  const saved = await read('lessons')
  await write('subjects', nextCatalog)
  await write('lessons', [copy, ...saved])
  return { ok: true, data: copy }
}

export async function getLessonDraft(id: string): Promise<LessonInput | undefined> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return undefined
  const draft = (await read('lessonDrafts')).find((item) => item.lessonId === id)
  if (!draft || user.role === 'teacher' && draft.ownerId !== user.id) return undefined
  return draft.data
}

export async function saveLessonDraft(input: LessonInput): Promise<ApiResult<LessonInput>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  if (!input.id || !input.subjectId || !input.chapterId) return { ok: false, error: 'Sélectionnez une matière et un module avant l’enregistrement automatique.' }
  const catalog = await read('subjects')
  if (!catalog.some((subject) => subject.id === input.subjectId && subject.chapters.some((chapter) => chapter.id === input.chapterId))) {
    return { ok: false, error: 'Sélectionnez une matière et un module existants.' }
  }
  const existing = (await allLessons()).find((lesson) => lesson.id === input.id)
  if (existing && user.role === 'teacher' && existing.ownerId !== user.id) return { ok: false, error: 'Vous pouvez enregistrer uniquement vos propres brouillons.' }
  const drafts = await read('lessonDrafts')
  const ownerId = user.role === 'admin' ? input.ownerId ?? existing?.ownerId ?? user.id : user.id
  const data: LessonInput = { ...input, ownerId, teacherId: ownerId, status: 'draft' }
  const record = { lessonId: input.id, ownerId, data, updatedAt: timestamp() }
  await write('lessonDrafts', [record, ...drafts.filter((item) => item.lessonId !== input.id)])
  return { ok: true, data }
}

export async function setContentOwner(
  kind: 'subject' | 'module' | 'lesson' | 'exam',
  subjectId: string,
  contentId: string,
  ownerId: string,
): Promise<ApiResult<void>> {
  const user = await getCurrentUser()
  if (user?.role !== 'admin') return { ok: false, error: 'Admin permission required' }
  const owner = (await read('users')).find((account) => account.id === ownerId && account.role === 'teacher')
  if (!owner) return { ok: false, error: 'Enseignant introuvable.' }
  if (kind === 'subject') {
    const subjects = await read('subjects')
    if (!subjects.some((subject) => subject.id === contentId)) return { ok: false, error: 'Matière introuvable.' }
    await write('subjects', subjects.map((subject) => subject.id === contentId ? { ...subject, ownerIds: [ownerId], updatedAt: timestamp() } : subject))
  } else if (kind === 'module') {
    const subjects = await read('subjects')
    const subject = subjects.find((item) => item.id === subjectId)
    if (!subject?.chapters.some((chapter) => chapter.id === contentId)) return { ok: false, error: 'Module introuvable.' }
    await write('subjects', subjects.map((item) => item.id !== subjectId ? item : ({
      ...item,
      chapters: item.chapters.map((chapter) => chapter.id === contentId ? { ...chapter, ownerId, updatedAt: timestamp() } : chapter),
    })))
  } else if (kind === 'lesson') {
    const lesson = (await allLessons()).find((item) => item.id === contentId)
    if (!lesson) return { ok: false, error: 'Leçon introuvable.' }
    const updated = { ...lesson, ownerId, teacherId: ownerId, updatedAt: timestamp() }
    await write('subjects', saveLessonIntoCatalog(await read('subjects'), updated))
    await write('lessons', [updated, ...(await read('lessons')).filter((item) => item.id !== contentId)])
  } else {
    const exams = await read('exams')
    if (!exams.some((exam) => exam.id === contentId)) return { ok: false, error: 'Annale introuvable.' }
    await write('exams', exams.map((exam) => exam.id === contentId ? { ...exam, ownerId, teacherId: ownerId, updatedAt: timestamp() } : exam))
  }
  return { ok: true, data: undefined }
}

export async function setContentStatus(
  kind: 'subject' | 'module' | 'lesson' | 'exam',
  subjectId: string,
  contentId: string,
  status: 'draft' | 'published',
): Promise<ApiResult<void>> {
  const user = await getCurrentUser()
  if (user?.role !== 'admin') return { ok: false, error: 'Admin permission required' }
  const now = timestamp()
  if (kind === 'subject') {
    const catalog = await read('subjects')
    if (!catalog.some((subject) => subject.id === contentId)) return { ok: false, error: 'Matière introuvable.' }
    await write('subjects', catalog.map((subject) => subject.id === contentId ? { ...subject, status, updatedAt: now } : subject))
  } else if (kind === 'module') {
    const catalog = await read('subjects')
    if (!catalog.some((subject) => subject.id === subjectId && subject.chapters.some((chapter) => chapter.id === contentId))) {
      return { ok: false, error: 'Module introuvable.' }
    }
    await write('subjects', catalog.map((subject) => subject.id !== subjectId ? subject : ({
      ...subject, chapters: subject.chapters.map((chapter) => chapter.id === contentId ? { ...chapter, status, updatedAt: now } : chapter),
    })))
  } else if (kind === 'lesson') {
    if (!(await allLessons()).some((lesson) => lesson.id === contentId)) return { ok: false, error: 'Leçon introuvable.' }
    const result = await setLessonsStatus([contentId], status)
    if (!result.ok) return result
  } else {
    const exams = await read('exams')
    if (!exams.some((exam) => exam.id === contentId)) return { ok: false, error: 'Annale introuvable.' }
    await write('exams', exams.map((exam) => exam.id === contentId ? { ...exam, status, updatedAt: now } : exam))
  }
  return { ok: true, data: undefined }
}

export async function saveLesson(input: LessonInput): Promise<ApiResult<Lesson>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const all = await allLessons()
  const id = input.id ?? makeId('lesson')
  const existing = all.find((lesson) => lesson.id === id)
  if (existing && user.role === 'teacher' && existing.ownerId !== user.id) return { ok: false, error: 'Vous pouvez modifier uniquement vos propres leçons.' }
  const ownerId = user.role === 'admin' ? input.ownerId ?? existing?.ownerId ?? user.id : user.id
  const isPublished = input.status === 'published'
  if ((isPublished && input.title.trim().length < 2) || !Number.isInteger(input.duration) || input.duration <= 0
    || (isPublished && input.summary.trim().length < 10) || !Number.isInteger(input.order) || input.order < 0
    || (isPublished && input.exercises.some((exercise) => !exercise.prompt.trim() || !exercise.correction.trim()))
    || (isPublished && (!input.quiz.title.trim() || input.quiz.questions.length === 0))
    || (isPublished && input.quiz.questions.some((question) => question.prompt.trim().length === 0 || question.choices.length !== 4
      || question.choices.some((choice) => !choice.trim()) || !Number.isInteger(question.answer)
      || question.answer < 0 || question.answer > 3 || !question.explanation.trim()))) {
    return { ok: false, error: 'Les informations de la leçon sont invalides.' }
  }
  const catalog = await read('subjects')
  const subject = catalog.find((item) => item.id === input.subjectId)
  const chapter = subject?.chapters.find((item) => item.id === input.chapterId)
  if (!subject || !chapter) return { ok: false, error: 'Sélectionnez un module existant.' }
  const legacyVideo = input.videoUrl.trim() ? parseVideoUrl(input.videoUrl) : undefined
  if (isPublished && legacyVideo && !legacyVideo.ok) return { ok: false, error: legacyVideo.error }
  const videos = input.videos.length > 0 ? input.videos : legacyVideo?.ok ? [{
    id: makeId('video'),
    title: 'Cours',
    provider: legacyVideo.data.provider,
    url: legacyVideo.data.url,
    durationSeconds: input.duration * 60,
    order: 0,
  }] : []
  if (isPublished) {
    for (const video of videos) {
      const parsed = parseVideoUrl(video.url)
      if (!parsed.ok) return { ok: false, error: parsed.error }
      if (parsed.data.provider !== video.provider || !video.title.trim() || !Number.isInteger(video.order)
        || video.order < 0 || !Number.isFinite(video.durationSeconds) || video.durationSeconds < 0) {
        return { ok: false, error: 'Les informations d’une vidéo sont invalides.' }
      }
    }
  }
  if (input.pdfUrl && !input.pdfUrl.startsWith('data:application/pdf;base64,')) return { ok: false, error: 'Le PDF doit être un fichier PDF validé.' }
  if (input.pdfUrl) {
    const encoded = input.pdfUrl.slice('data:application/pdf;base64,'.length)
    const decodedSize = Math.floor(encoded.length * 3 / 4) - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0)
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || decodedSize > 3 * 1024 * 1024 || !validFileSignature(encoded, 'application/pdf')) {
      return { ok: false, error: 'Le PDF doit être un fichier PDF validé.' }
    }
  }
  const now = timestamp()
  const quiz = {
    ...input.quiz,
    id: input.quiz.id ?? makeId('quiz'),
    ownerId,
    status: input.quiz.status ?? input.status,
    order: input.quiz.order ?? 0,
    createdAt: existing?.quiz.createdAt ?? input.quiz.createdAt ?? now,
    updatedAt: now,
  }
  const lesson: Lesson = {
    ...input,
    id,
    ownerId,
    teacherId: ownerId,
    videos: videos.map((video) => ({ ...video })),
    videoUrl: videos[0]?.url ?? '',
    exercises: input.exercises.map((exercise, index) => ({
      ...exercise,
      id: exercise.id ?? makeId('exercise'),
      ownerId,
      status: exercise.status ?? input.status,
      order: exercise.order ?? index,
      createdAt: existing?.exercises.find((item) => item.id === exercise.id)?.createdAt ?? exercise.createdAt ?? now,
      updatedAt: now,
    })),
    quiz,
    views: existing?.views ?? 0,
    createdAt: existing?.createdAt ?? input.createdAt ?? now,
    updatedAt: now,
  }
  const nextCatalog = saveLessonIntoCatalog(catalog, lesson)
  const saved = await read('lessons')
  const deletedIds = await read('deletedLessons')
  await write('subjects', nextCatalog)
  await write('deletedLessons', deletedIds.filter((deletedId) => deletedId !== lesson.id))
  await write('lessons', [lesson, ...saved.filter((item) => item.id !== lesson.id)])
  await write('lessonDrafts', (await read('lessonDrafts')).filter((item) => item.lessonId !== lesson.id))
  if (lesson.status === 'published' && existing?.status !== 'published') {
    await notifyStudents('new-lesson', 'Nouveau cours disponible', `La leçon « ${lesson.title} » est disponible.`, `/lessons/${lesson.id}`)
  }
  return { ok: true, data: lesson }
}

export async function deleteLesson(id: string): Promise<ApiResult<null>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const lesson = (await allLessons()).find((item) => item.id === id)
  if (!lesson || user.role === 'teacher' && lesson.ownerId !== user.id) return { ok: false, error: 'Vous pouvez supprimer uniquement vos propres leçons.' }
  const trash: ContentTrashItem[] = await read('contentTrash')
  await write('contentTrash', [{ id: makeId('trash'), kind: 'lesson', deletedAt: timestamp(), subjectId: lesson.subjectId ?? '', moduleId: lesson.chapterId ?? '', lesson }, ...trash])
  await write('deletedLessons', [...new Set([...await read('deletedLessons'), id])])
  return { ok: true, data: null }
}

export async function deleteModule(subjectId: string, moduleId: string): Promise<ApiResult<null>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const catalog = await read('subjects')
  const subject = catalog.find((item) => item.id === subjectId)
  const chapter = subject?.chapters.find((item) => item.id === moduleId)
  if (!subject || !chapter || user.role === 'teacher' && chapter.ownerId !== user.id) return { ok: false, error: 'Vous pouvez supprimer uniquement vos propres modules.' }
  if (user.role === 'teacher' && chapter.lessons.some((lesson) => lesson.ownerId !== user.id)) {
    return { ok: false, error: 'Ce module contient des leçons appartenant à d’autres enseignants.' }
  }
  const trash: ContentTrashItem[] = await read('contentTrash')
  await write('contentTrash', [{ id: makeId('trash'), kind: 'module', deletedAt: timestamp(), subjectId, module: chapter }, ...trash])
  const lessonIds = chapter.lessons.map((lesson) => lesson.id)
  await write('deletedLessons', [...new Set([...(await read('deletedLessons')), ...lessonIds])])
  await write('subjects', catalog.map((item) => item.id === subjectId
    ? { ...item, chapters: item.chapters.filter((chapter) => chapter.id !== moduleId) }
    : item))
  return { ok: true, data: null }
}

export async function deleteSubject(subjectId: string): Promise<ApiResult<null>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const catalog = await read('subjects')
  const subject = catalog.find((item) => item.id === subjectId)
  if (!subject || user.role === 'teacher' && !subject.ownerIds.includes(user.id)) return { ok: false, error: 'Vous pouvez supprimer uniquement vos propres matières.' }
  if (user.role === 'teacher' && subject.chapters.some((chapter) => chapter.ownerId !== user.id
    || chapter.lessons.some((lesson) => lesson.ownerId !== user.id))) {
    return { ok: false, error: 'Cette matière contient du contenu appartenant à d’autres enseignants.' }
  }
  const trash: ContentTrashItem[] = await read('contentTrash')
  await write('contentTrash', [{ id: makeId('trash'), kind: 'subject', deletedAt: timestamp(), subject }, ...trash])
  const lessonIds = subject.chapters.flatMap((chapter) => chapter.lessons.map((lesson) => lesson.id))
  await write('deletedLessons', [...new Set([...(await read('deletedLessons')), ...lessonIds])])
  await write('subjects', catalog.filter((item) => item.id !== subjectId))
  return { ok: true, data: null }
}

export async function getContentTrash(): Promise<ContentTrashItem[]> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return []
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  const active = (await read('contentTrash')).filter((item) => new Date(item.deletedAt).getTime() >= cutoff)
  return user.role === 'admin' ? active : active.filter((item) => {
    if (item.kind === 'subject') return item.subject.ownerIds.includes(user.id)
    if (item.kind === 'module') return item.module.ownerId === user.id
    return item.lesson.ownerId === user.id
  })
}

export async function restoreContent(id: string): Promise<ApiResult<ContentTrashItem>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const rows = await read('contentTrash')
  const item = rows.find((entry) => entry.id === id)
  if (!item || Date.now() - new Date(item.deletedAt).getTime() > 30 * 24 * 60 * 60 * 1000) return { ok: false, error: 'Cette corbeille a expiré.' }
  const ownerId = item.kind === 'subject' ? item.subject.ownerIds.includes(user.id) : item.kind === 'module' ? item.module.ownerId === user.id : item.lesson.ownerId === user.id
  if (user.role === 'teacher' && !ownerId) return { ok: false, error: 'Vous ne pouvez restaurer que votre propre contenu.' }
  const catalog = await read('subjects')
  if (item.kind === 'subject') {
    if (!catalog.some((subject) => subject.id === item.subject.id)) await write('subjects', [...catalog, item.subject])
  } else if (item.kind === 'module') {
    const subject = catalog.find((entry) => entry.id === item.subjectId)
    if (!subject) return { ok: false, error: 'Restaurez d’abord la matière parente.' }
    await write('subjects', catalog.map((entry) => entry.id === item.subjectId
      ? { ...entry, chapters: [...entry.chapters, item.module].sort((a, b) => a.order - b.order) }
      : entry))
  } else {
    const subject = catalog.find((entry) => entry.id === item.subjectId)
    if (!subject?.chapters.some((chapter) => chapter.id === item.moduleId)) return { ok: false, error: 'Restaurez d’abord le module parent.' }
    await write('subjects', catalog.map((entry) => entry.id !== item.subjectId ? entry : ({
      ...entry,
      chapters: entry.chapters.map((chapter) => chapter.id !== item.moduleId ? chapter : ({
        ...chapter, lessons: [...chapter.lessons, item.lesson].sort((a, b) => a.order - b.order),
      })),
    })))
  }
  const restoredIds = item.kind === 'subject'
    ? item.subject.chapters.flatMap((chapter) => chapter.lessons.map((lesson) => lesson.id))
    : item.kind === 'module' ? item.module.lessons.map((lesson) => lesson.id) : [item.lesson.id]
  await write('deletedLessons', (await read('deletedLessons')).filter((lessonId) => !restoredIds.includes(lessonId)))
  if (item.kind === 'lesson') {
    const saved = await read('lessons')
    await write('lessons', [item.lesson, ...saved.filter((lesson) => lesson.id !== item.lesson.id)])
  }
  await write('contentTrash', rows.filter((entry) => entry.id !== id))
  return { ok: true, data: item }
}

export async function setLessonsStatus(ids: string[], status: Lesson['status']): Promise<ApiResult<Lesson[]>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const lessons = await allLessons()
  const selected = lessons.filter((lesson) => ids.includes(lesson.id))
  if (selected.length !== new Set(ids).size || user.role === 'teacher' && selected.some((lesson) => lesson.ownerId !== user.id)) {
    return { ok: false, error: 'Vous ne pouvez modifier que vos propres leçons.' }
  }
  const updated = selected.map((lesson) => ({ ...lesson, status, updatedAt: timestamp() }))
  const catalog = await read('subjects')
  const map = new Map(updated.map((lesson) => [lesson.id, lesson]))
  await write('subjects', catalog.map((subject) => ({
    ...subject,
    chapters: subject.chapters.map((chapter) => ({
      ...chapter,
      lessons: chapter.lessons.map((lesson) => map.get(lesson.id) ?? lesson),
    })),
  })))
  const saved = await read('lessons')
  await write('lessons', saved.map((lesson) => map.get(lesson.id) ?? lesson))
  for (const lesson of updated) if (status === 'published') await notifyStudents('new-lesson', 'Nouveau cours disponible', `La leçon « ${lesson.title} » est disponible.`, `/lessons/${lesson.id}`)
  return { ok: true, data: updated }
}

export async function reorderLessons(changes: ReorderLessonInput[]): Promise<ApiResult<Lesson[]>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const all = await allLessons()
  const byId = new Map(changes.map(({ lessonId, order }) => [lessonId, order]))
  const affected = all.filter((lesson) => byId.has(lesson.id))
  if (affected.length !== byId.size || affected.some((lesson) => user.role === 'teacher' && lesson.ownerId !== user.id)
    || changes.some((change) => !Number.isInteger(change.order) || change.order < 0)) {
    return { ok: false, error: 'Vous pouvez réordonner uniquement vos propres leçons.' }
  }
  const updated = affected.map((lesson) => ({ ...lesson, order: byId.get(lesson.id)!, updatedAt: timestamp() }))
  const map = new Map(updated.map((lesson) => [lesson.id, lesson]))
  const catalog = await read('subjects')
  await write('subjects', catalog.map((subject) => ({
    ...subject,
    chapters: subject.chapters.map((chapter) => ({
      ...chapter,
      lessons: chapter.lessons.map((lesson) => map.get(lesson.id) ?? lesson).sort((a, b) => a.order - b.order),
    })),
  })))
  const saved = await read('lessons')
  await write('lessons', saved.map((lesson) => map.get(lesson.id) ?? lesson))
  return { ok: true, data: updated }
}

export async function saveExam(input: ExamInput): Promise<ApiResult<Exam>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const saved = await read('exams')
  const id = input.id ?? makeId('exam')
  const existing = saved.find((exam) => exam.id === id)
  if (existing && user.role === 'teacher' && existing.ownerId !== user.id) return { ok: false, error: 'Vous pouvez modifier uniquement vos propres annales.' }
  const ownerId = user.role === 'admin' ? input.ownerId ?? existing?.ownerId ?? user.id : user.id
  const catalog = await read('subjects')
  if (!catalog.some((subject) => subject.id === input.subjectId) || !input.session.trim()
    || !Number.isInteger(input.year) || input.year < 1990 || input.year > 2100
    || input.statement.trim().length < 10 || input.correction.trim().length < 10) return { ok: false, error: 'Invalid exam details' }
  const now = timestamp()
  const result: Exam = {
    ...input,
    id,
    ownerId,
    teacherId: ownerId,
    status: input.status ?? 'draft',
    order: input.order ?? saved.length,
    createdAt: existing?.createdAt ?? input.createdAt ?? now,
    updatedAt: now,
  }
  await write('exams', [result, ...saved.filter((exam) => exam.id !== id)])
  return { ok: true, data: result }
}

export async function getTeacherExams(): Promise<Exam[]> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return []
  return (await read('exams')).filter((exam) => user.role === 'admin' || exam.ownerId === user.id)
}

export async function deleteExam(id: string): Promise<ApiResult<null>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const rows = await read('exams')
  const exam = rows.find((item) => item.id === id)
  if (!exam || (user.role === 'teacher' && exam.ownerId !== user.id)) return { ok: false, error: 'Vous pouvez supprimer uniquement vos propres annales.' }
  await write('exams', rows.filter((item) => item.id !== id))
  return { ok: true, data: null }
}

export async function getSettings(): Promise<PlatformSettings> {
  return read('settings')
}

export async function saveSettings(input: PlatformSettings): Promise<ApiResult<PlatformSettings>> {
  const user = await getCurrentUser()
  if (user?.role !== 'admin') return { ok: false, error: 'Admin permission required' }
  if (!Number.isFinite(input.monthlyPrice) || input.monthlyPrice <= 0
    || input.paymentsEnabled && input.paymentInstructions.trim().length < 5
    || input.subscriptionScope && input.subscriptionScope !== 'platform'
    || input.pricingScope && input.pricingScope !== 'group'
    || input.gracePeriodDays !== undefined && (!Number.isInteger(input.gracePeriodDays) || input.gracePeriodDays < 0 || input.gracePeriodDays > 90)) {
    return { ok: false, error: 'Les paramètres sont invalides. Seul l’abonnement plateforme est activé.' }
  }
  const saved = {
    ...input,
    paymentInstructions: input.paymentInstructions ?? '',
    subscriptionScope: 'platform' as const,
    pricingScope: 'group' as const,
    paymentsEnabled: input.paymentsEnabled === true,
    gracePeriodDays: input.gracePeriodDays ?? 7,
  }
  await write('settings', saved)
  return { ok: true, data: saved }
}

function groupForViewer(group: ClassGroup, paymentsEnabled: boolean): ClassGroup {
  return paymentsEnabled ? group : { ...group, monthlyPrice: null }
}

export async function listSections(includeInactive = false): Promise<BacSection[]> {
  const user = await getCurrentUser()
  const sections = await read('sections')
  return sections.filter((section) => includeInactive && user?.role === 'admin' || section.active)
    .sort((a, b) => a.order - b.order)
}

export async function saveSection(input: { id?: string; name: string; active?: boolean }): Promise<ApiResult<BacSection>> {
  const user = await getCurrentUser()
  if (user?.role !== 'admin') return { ok: false, error: 'Réservé à l’administration.' }
  const name = input.name.trim()
  if (name.length < 2 || name.length > 80) return { ok: false, error: 'Le nom de la filière est invalide.' }
  const sections = await read('sections')
  const existing = sections.find((section) => section.id === input.id)
  if (sections.some((section) => section.id !== input.id && section.name.toLocaleLowerCase('fr-FR') === name.toLocaleLowerCase('fr-FR'))) {
    return { ok: false, error: 'Cette filière existe déjà.' }
  }
  const section: BacSection = {
    id: existing?.id ?? makeId('section'),
    name,
    order: existing?.order ?? sections.length,
    active: input.active ?? existing?.active ?? true,
  }
  await write('sections', existing
    ? sections.map((item) => item.id === existing.id ? section : item)
    : [...sections, section])
  if (existing && existing.name !== name) {
    const users = await read('users')
    const updatedUsers = users.map((item) => item.sectionId === section.id ? { ...item, section: name } : item)
    await write('users', updatedUsers)
    const credentials = await getAuthCredentials()
    await saveAuthCredentials(credentials.map((credential) => {
      const updated = updatedUsers.find((item) => item.id === credential.user.id)
      return updated ? { ...credential, user: updated } : credential
    }))
  }
  return { ok: true, data: section }
}

export async function listClassGroups(filters: { sectionId?: string; subjectId?: string } = {}): Promise<ClassGroup[]> {
  const user = await getCurrentUser()
  const paymentsEnabled = Boolean((await getSettings()).paymentsEnabled)
  const [groups, enrollments] = await Promise.all([read('classGroups'), read('groupEnrollments')])
  const visible = groups.filter((group) => !filters.sectionId || group.sectionId === filters.sectionId)
    .filter((group) => !filters.subjectId || group.subjectId === filters.subjectId)
    .filter((group) => user?.role === 'admin'
      || user?.role === 'teacher' && group.teacherId === user.id
      || user?.role !== 'teacher' && (group.status === 'ouvert aux inscriptions'
        || user?.role === 'student' && enrollments.some((enrollment) =>
          enrollment.studentId === user.id && enrollment.groupId === group.id
          && ['en attente', 'accepté'].includes(enrollment.status))))
  return visible.map((group) => groupForViewer(group, paymentsEnabled))
}

export async function getClassGroup(groupId: string): Promise<ClassGroup | undefined> {
  const group = (await read('classGroups')).find((item) => item.id === groupId)
  if (!group) return undefined
  const user = await getCurrentUser()
  const isEnrolled = user?.role === 'student'
    && (await read('groupEnrollments')).some((item) =>
      item.groupId === group.id && item.studentId === user.id && item.status !== 'retiré')
  if (user?.role !== 'admin' && user?.role !== 'teacher' && group.status !== 'ouvert aux inscriptions' && !isEnrolled) return undefined
  if (user?.role === 'teacher' && group.teacherId !== user.id) return undefined
  return groupForViewer(group, Boolean((await getSettings()).paymentsEnabled))
}

export async function getAcceptedGroupCount(groupId: string): Promise<number> {
  if (!(await read('classGroups')).some((group) => group.id === groupId)) return 0
  return (await read('groupEnrollments')).filter((item) => item.groupId === groupId && item.status === 'accepté').length
}

export async function createClassGroup(input: Omit<ClassGroup, 'id' | 'teacherId' | 'createdAt' | 'scheduleStatus'> & { teacherId?: string }): Promise<ApiResult<ClassGroup>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Réservé aux enseignants.' }
  const sections = await read('sections')
  const subject = (await read('subjects')).find((item) => item.id === input.subjectId)
  const teacherId = user.role === 'admin' ? input.teacherId ?? user.id : user.id
  const ownerCanTeach = user.role === 'admin' || Boolean(subject && (
    subject.ownerIds.includes(user.id) || (await read('teacherAssignments'))[user.id]?.includes(subject.id)))
  if (!sections.some((section) => section.id === input.sectionId && section.active) || !subject
    || !ownerCanTeach || !Number.isInteger(input.maxStudents) || input.maxStudents < 1
    || input.name.trim().length < 3 || input.description.length > 2000
    || input.monthlyPrice !== null && (!Number.isFinite(input.monthlyPrice) || input.monthlyPrice < 0)) {
    return { ok: false, error: 'Les informations de la classe sont invalides.' }
  }
  const group: ClassGroup = {
    ...input, id: makeId('group'), teacherId, name: input.name.trim(),
    scheduleStatus: 'en attente', createdAt: timestamp(),
  }
  await write('classGroups', [group, ...await read('classGroups')])
  return { ok: true, data: groupForViewer(group, Boolean((await getSettings()).paymentsEnabled)) }
}

export async function updateClassGroup(groupId: string, changes: Partial<Pick<ClassGroup, 'name' | 'sectionId' | 'subjectId' | 'maxStudents' | 'description' | 'monthlyPrice' | 'status'>>): Promise<ApiResult<ClassGroup>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Réservé aux enseignants.' }
  const groups = await read('classGroups')
  const group = groups.find((item) => item.id === groupId)
  if (!group || user.role === 'teacher' && group.teacherId !== user.id) return { ok: false, error: 'Classe inaccessible.' }
  const next = { ...group, ...changes, name: changes.name?.trim() ?? group.name }
  if (next.name.length < 3 || !Number.isInteger(next.maxStudents) || next.maxStudents < 1
    || next.description.length > 2000 || next.monthlyPrice !== null
      && (!Number.isFinite(next.monthlyPrice) || next.monthlyPrice < 0)
    || !await read('sections').then((rows) => rows.some((section) => section.id === next.sectionId && section.active))
    || !await read('subjects').then((rows) => rows.some((subject) => subject.id === next.subjectId))) {
    return { ok: false, error: 'Les modifications de la classe sont invalides.' }
  }
  const acceptedCount = (await read('groupEnrollments')).filter((item) => item.groupId === groupId && item.status === 'accepté').length
  if (next.maxStudents < acceptedCount) return { ok: false, error: 'La capacité ne peut pas être inférieure au nombre d’élèves inscrits.' }
  await write('classGroups', groups.map((item) => item.id === groupId ? next : item))
  return { ok: true, data: groupForViewer(next, Boolean((await getSettings()).paymentsEnabled)) }
}

export async function duplicateClassGroup(groupId: string): Promise<ApiResult<ClassGroup>> {
  const user = await getCurrentUser()
  const source = (await read('classGroups')).find((group) => group.id === groupId)
  if (!source || user?.role !== 'admin' && (user?.role !== 'teacher' || source.teacherId !== user.id)) {
    return { ok: false, error: 'Classe inaccessible.' }
  }
  const duplicate: ClassGroup = {
    ...source, id: makeId('group'), name: `${source.name} (copie)`,
    status: 'ouvert aux inscriptions', scheduleStatus: 'en attente', createdAt: timestamp(),
  }
  await write('classGroups', [duplicate, ...await read('classGroups')])
  return { ok: true, data: groupForViewer(duplicate, Boolean((await getSettings()).paymentsEnabled)) }
}

export async function requestGroupEnrollment(groupId: string): Promise<ApiResult<GroupEnrollment>> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') return { ok: false, error: 'Seuls les élèves peuvent demander à rejoindre une classe.' }
  const groups = await read('classGroups')
  const group = groups.find((item) => item.id === groupId)
  if (!group || group.status !== 'ouvert aux inscriptions') return { ok: false, error: 'Cette classe n’accepte pas de nouvelles inscriptions.' }
  const sections = await read('sections')
  const section = sections.find((item) => item.id === group.sectionId)
  if (user.sectionId ? user.sectionId !== group.sectionId : user.section !== section?.name) {
    return { ok: false, error: 'Cette classe est réservée à une autre filière.' }
  }
  const enrollments = await read('groupEnrollments')
  const activeForSubject = enrollments.find((enrollment) => {
    const enrolledGroup = groups.find((item) => item.id === enrollment.groupId)
    return enrollment.studentId === user.id && ['en attente', 'accepté'].includes(enrollment.status)
      && enrolledGroup?.subjectId === group.subjectId
  })
  if (activeForSubject) return { ok: false, error: 'Vous avez déjà une demande ou une inscription pour cette matière.' }
  const alreadyRequested = enrollments.find((item) =>
    item.studentId === user.id && item.groupId === groupId && item.status === 'en attente')
  if (alreadyRequested) return { ok: true, data: alreadyRequested }
  const acceptedCount = enrollments.filter((item) => item.groupId === groupId && item.status === 'accepté').length
  const enrollment: GroupEnrollment = {
    id: makeId('enrollment'), studentId: user.id, groupId, status: 'en attente', requestedAt: timestamp(),
    ...(acceptedCount >= group.maxStudents ? { decisionReason: 'En attente de disponibilité : la classe est complète.' } : {}),
  }
  await write('groupEnrollments', [enrollment, ...enrollments])
  const teachers = await read('notifications')
  const notification: Notification = {
    id: makeId('notification'), userId: group.teacherId, type: 'enrollment-request',
    title: 'Nouvelle demande d’inscription', message: `Un élève demande à rejoindre « ${group.name} ».`,
    href: '/teacher/groups', createdAt: timestamp(),
  }
  await write('notifications', [notification, ...teachers])
  return { ok: true, data: enrollment }
}

export async function decideGroupEnrollment(enrollmentId: string, decision: 'accepté' | 'refusé', reason = ''): Promise<ApiResult<GroupEnrollment>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Réservé aux enseignants.' }
  const enrollments = await read('groupEnrollments')
  const enrollment = enrollments.find((item) => item.id === enrollmentId && item.status === 'en attente')
  const group = enrollment && (await read('classGroups')).find((item) => item.id === enrollment.groupId)
  if (!enrollment || !group || user.role === 'teacher' && group.teacherId !== user.id) return { ok: false, error: 'Demande inaccessible.' }
  if (decision === 'refusé' && reason.trim().length < 3) return { ok: false, error: 'Indiquez un motif de refus.' }
  if (decision === 'accepté') {
    const acceptedCount = enrollments.filter((item) => item.groupId === group.id && item.status === 'accepté').length
    if (acceptedCount >= group.maxStudents) return { ok: false, error: 'La classe est complète. La demande reste en attente.' }
  }
  const updated: GroupEnrollment = {
    ...enrollment, status: decision, decidedAt: timestamp(),
    ...(decision === 'refusé' ? { decisionReason: reason.trim() } : { decisionReason: undefined }),
  }
  await write('groupEnrollments', enrollments.map((item) => item.id === enrollmentId ? updated : item))
  if (decision === 'accepté') {
    const count = enrollments.filter((item) => item.groupId === group.id && item.status === 'accepté').length + 1
    if (count >= group.maxStudents) await write('classGroups', (await read('classGroups')).map((item) =>
      item.id === group.id ? { ...item, status: 'complet' as const } : item))
  }
  const notification: Notification = {
    id: makeId('notification'), userId: enrollment.studentId,
    type: decision === 'accepté' ? 'enrollment-accepted' : 'enrollment-refused',
    title: decision === 'accepté' ? 'Demande acceptée' : 'Demande refusée',
    message: decision === 'accepté' ? `Votre inscription à « ${group.name} » est acceptée.`
      : `Votre demande pour « ${group.name} » a été refusée : ${reason.trim()}`,
    href: '/student/groups', createdAt: timestamp(),
  }
  await write('notifications', [notification, ...await read('notifications')])
  return { ok: true, data: updated }
}

export async function leaveClassGroup(groupId: string): Promise<ApiResult<GroupEnrollment>> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') return { ok: false, error: 'Réservé aux élèves.' }
  const enrollments = await read('groupEnrollments')
  const enrollment = enrollments.find((item) =>
    item.groupId === groupId && item.studentId === user.id && ['accepté', 'en attente'].includes(item.status))
  if (!enrollment) return { ok: false, error: 'Inscription introuvable.' }
  const updated = { ...enrollment, status: 'retiré' as const, leftAt: timestamp() }
  await write('groupEnrollments', enrollments.map((item) => item.id === enrollment.id ? updated : item))
  const groups = await read('classGroups')
  await write('classGroups', groups.map((group) => group.id === groupId && group.status === 'complet'
    ? { ...group, status: 'ouvert aux inscriptions' as const } : group))
  return { ok: true, data: updated }
}

export async function getMyGroupEnrollments(): Promise<Array<{ enrollment: GroupEnrollment; group: ClassGroup }>> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') return []
  const [enrollments, groups, settings] = await Promise.all([read('groupEnrollments'), read('classGroups'), getSettings()])
  return enrollments.filter((item) => item.studentId === user.id && ['en attente', 'accepté'].includes(item.status))
    .flatMap((enrollment) => {
      const group = groups.find((item) => item.id === enrollment.groupId)
      return group ? [{ enrollment, group: groupForViewer(group, Boolean(settings.paymentsEnabled)) }] : []
    })
}

export async function getTeacherGroupRequests(): Promise<Array<{ enrollment: GroupEnrollment; groupName: string; studentName: string; section: string }>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher') return []
  const [enrollments, groups, users] = await Promise.all([read('groupEnrollments'), read('classGroups'), read('users')])
  return enrollments.filter((item) => item.status === 'en attente' && groups.some((group) =>
    group.id === item.groupId && group.teacherId === user.id))
    .flatMap((enrollment) => {
      const group = groups.find((item) => item.id === enrollment.groupId)
      const student = users.find((item) => item.id === enrollment.studentId && item.role === 'student')
      return group && student ? [{
        enrollment, groupName: group.name, studentName: privateStudentName(student.name), section: student.section,
      }] : []
    })
}

export async function getAdminGroupEnrollments(): Promise<Array<{
    enrollment: GroupEnrollment
    groupName: string
    studentName: string
    section: string
}>> {
    const user = await getCurrentUser()
    if (user?.role !== 'admin') return []
    const [enrollments, groups, users] = await Promise.all([
      read('groupEnrollments'), read('classGroups'), read('users'),
    ])
    return enrollments.flatMap((enrollment) => {
      const group = groups.find((item) => item.id === enrollment.groupId)
      const student = users.find((item) => item.id === enrollment.studentId && item.role === 'student')
      return group && student ? [{
        enrollment, groupName: group.name, studentName: privateStudentName(student.name), section: student.section,
      }] : []
    })
}

export async function linkGroupModule(groupId: string, moduleId: string, lessonIds: string[]): Promise<ApiResult<GroupContentLink>> {
    const user = await getCurrentUser()
    if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Réservé aux enseignants.' }
    const group = (await read('classGroups')).find((item) => item.id === groupId)
    if (!group || user.role === 'teacher' && group.teacherId !== user.id) return { ok: false, error: 'Classe inaccessible.' }
    if (lessonIds.length === 0 || new Set(lessonIds).size !== lessonIds.length) return { ok: false, error: 'Sélectionnez au moins une leçon sans doublon.' }
    const subject = (await read('subjects')).find((item) => item.id === group.subjectId)
    const chapter = subject?.chapters.find((item) => item.id === moduleId)
    const lessons = await allLessons()
    const selectedLessons = lessonIds.map((id) => lessons.find((lesson) => lesson.id === id))
    if (!chapter || !selectedLessons.every((lesson) => lesson && lesson.subjectId === group.subjectId
      && lesson.chapterId === moduleId && (user.role === 'admin' || lesson.ownerId === user.id))) {
      return { ok: false, error: 'Chaque leçon doit appartenir à ce module et être gérée par vous.' }
    }
    if (user.role === 'teacher' && chapter.ownerId !== user.id) return { ok: false, error: 'Vous ne pouvez lier que vos propres modules.' }
    const links = await read('groupContentLinks')
    const existing = links.find((link) => link.groupId === groupId && link.moduleId === moduleId)
    const link: GroupContentLink = {
      id: existing?.id ?? makeId('group-content'), groupId, moduleId,
      lessonIds, order: existing?.order ?? links.filter((item) => item.groupId === groupId).length,
      published: existing?.published ?? false,
    }
    await write('groupContentLinks', existing
      ? links.map((item) => item.id === existing.id ? link : item)
      : [...links, link])
    return { ok: true, data: link }
}

export async function setGroupContentPublished(linkId: string, published: boolean): Promise<ApiResult<GroupContentLink>> {
    const user = await getCurrentUser()
    if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Réservé aux enseignants.' }
    const links = await read('groupContentLinks')
    const link = links.find((item) => item.id === linkId)
    const group = link && (await read('classGroups')).find((item) => item.id === link.groupId)
    if (!link || !group || user.role === 'teacher' && group.teacherId !== user.id) return { ok: false, error: 'Contenu inaccessible.' }
    const updated = { ...link, published }
    await write('groupContentLinks', links.map((item) => item.id === linkId ? updated : item))
    return { ok: true, data: updated }
}

export async function reorderGroupContent(groupId: string, linkIds: string[]): Promise<ApiResult<GroupContentLink[]>> {
    const user = await getCurrentUser()
    if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Réservé aux enseignants.' }
    const group = (await read('classGroups')).find((item) => item.id === groupId)
    if (!group || user.role === 'teacher' && group.teacherId !== user.id) return { ok: false, error: 'Classe inaccessible.' }
    const links = await read('groupContentLinks')
    const groupLinks = links.filter((link) => link.groupId === groupId)
    if (new Set(linkIds).size !== groupLinks.length || groupLinks.some((link) => !linkIds.includes(link.id))) {
      return { ok: false, error: 'L’ordre du contenu est invalide.' }
    }
    const orderMap = new Map(linkIds.map((id, order) => [id, order]))
    const updated = links.map((link) => orderMap.has(link.id) ? { ...link, order: orderMap.get(link.id)! } : link)
    await write('groupContentLinks', updated)
    return { ok: true, data: updated.filter((link) => link.groupId === groupId).sort((a, b) => a.order - b.order) }
}

export async function getTeacherGroupContentLinks(groupId: string): Promise<GroupContentLink[]> {
    const user = await getCurrentUser()
    const group = (await read('classGroups')).find((item) => item.id === groupId)
    if (!group || user?.role !== 'admin' && user?.role !== 'teacher'
      || user?.role === 'teacher' && group.teacherId !== user.id) return []
    return (await read('groupContentLinks')).filter((item) => item.groupId === groupId)
      .sort((a, b) => a.order - b.order)
}

export async function getGroupLessons(groupId: string): Promise<Lesson[]> {
    const user = await getCurrentUser()
    const group = (await read('classGroups')).find((item) => item.id === groupId)
    if (!group || !user) return []
    if (user.role === 'teacher' && user.id !== group.teacherId) return []
    if (user.role === 'student' && !await hasGroupContentAccess(user.id, groupId)) return []
    const links = (await read('groupContentLinks')).filter((link) => link.groupId === groupId && link.published)
      .sort((a, b) => a.order - b.order)
    const lessonIds = links.flatMap((link) => link.lessonIds)
    const lessons = await Promise.all(lessonIds.map((id) => getLesson(id)))
    return lessons.filter((lesson): lesson is Lesson => Boolean(lesson))
}

export async function getGroupPreviewLessons(groupId: string): Promise<Lesson[]> {
    const group = (await read('classGroups')).find((item) => item.id === groupId)
    if (!group) return []
    const links = (await read('groupContentLinks')).filter((item) => item.groupId === groupId)
    const lessonIds = new Set(links.flatMap((item) => item.lessonIds))
    const lessons = (await allLessons()).filter((lesson) => lesson.subjectId === group.subjectId
      && lesson.isFree && lesson.status === 'published' && lesson.subjectId && lessonIds.has(lesson.id))
    return lessons.map(includeLegacyVideo)
}

export async function getMyOpenSchedulePolls(): Promise<Array<{ poll: SchedulePoll; groupName: string; votes: SchedulePollVote[] }>> {
    const user = await getCurrentUser()
    if (user?.role !== 'student') return []
    const [polls, enrollments, groups, votes] = await Promise.all([
      read('schedulePolls'), read('groupEnrollments'), read('classGroups'), read('schedulePollVotes'),
    ])
    return polls.filter((poll) => poll.status === 'ouvert' && enrollments.some((enrollment) =>
      enrollment.studentId === user.id && enrollment.groupId === poll.groupId && enrollment.status === 'accepté'))
      .flatMap((poll) => {
        const group = groups.find((item) => item.id === poll.groupId)
        return group ? [{
          poll, groupName: group.name,
          votes: votes.filter((vote) => vote.pollId === poll.id && vote.studentId === user.id),
        }] : []
      })
}

export async function getTeacherSchedulePolls(): Promise<Array<{ poll: SchedulePoll; groupName: string }>> {
      const user = await getCurrentUser()
      if (user?.role !== 'teacher') return []
      const [polls, groups] = await Promise.all([read('schedulePolls'), read('classGroups')])
      return polls.filter((poll) => poll.teacherId === user.id).flatMap((poll) => {
        const group = groups.find((item) => item.id === poll.groupId)
        return group ? [{ poll, groupName: group.name }] : []
      })
}

export async function getStudentScheduleConflicts(): Promise<Array<{ sessionId: string; groupName: string }>> {
      const user = await getCurrentUser()
      if (user?.role !== 'student') return []
      const [sessions, enrollments, groups] = await Promise.all([
        readLiveSessions(), read('groupEnrollments'), read('classGroups'),
      ])
      const enrolledGroupIds = new Set(enrollments.filter((item) =>
        item.studentId === user.id && item.status === 'accepté').map((item) => item.groupId))
      const enrolledSessions = sessions.filter((session) =>
        session.groupId && enrolledGroupIds.has(session.groupId) && session.status !== 'cancelled')
      const conflicts: Array<{ sessionId: string; groupName: string }> = []
      for (const session of enrolledSessions) {
        const other = enrolledSessions.find((candidate) => candidate.id !== session.id
          && candidate.groupId !== session.groupId && hasSessionConflict(session, [candidate]))
        if (other) {
          const group = groups.find((item) => item.id === other.groupId)
          if (group) conflicts.push({ sessionId: session.id, groupName: group.name })
        }
      }
      return conflicts
}

export async function forceCloseClassGroup(groupId: string): Promise<ApiResult<ClassGroup>> {
      const user = await getCurrentUser()
      if (user?.role !== 'admin') return { ok: false, error: 'Réservé à l’administration.' }
      const groups = await read('classGroups')
      const group = groups.find((item) => item.id === groupId)
      if (!group) return { ok: false, error: 'Classe introuvable.' }
      const updated = { ...group, status: 'fermé' as const }
      await write('classGroups', groups.map((item) => item.id === groupId ? updated : item))
      return { ok: true, data: updated }
}

export async function adminMoveStudentToGroup(studentId: string, fromGroupId: string, toGroupId: string): Promise<ApiResult<GroupEnrollment>> {
      const user = await getCurrentUser()
      if (user?.role !== 'admin') return { ok: false, error: 'Réservé à l’administration.' }
      const [groups, enrollments, users, sections] = await Promise.all([
        read('classGroups'), read('groupEnrollments'), read('users'), read('sections'),
      ])
      const source = groups.find((item) => item.id === fromGroupId)
      const target = groups.find((item) => item.id === toGroupId && item.status !== 'fermé')
      const student = users.find((item) => item.id === studentId && item.role === 'student')
      if (!source || !target || !student || source.subjectId !== target.subjectId) {
        return { ok: false, error: 'Le déplacement entre classes est invalide.' }
      }
      const targetSection = sections.find((item) => item.id === target.sectionId)
      if (student.sectionId ? student.sectionId !== target.sectionId : student.section !== targetSection?.name) {
        return { ok: false, error: 'L’élève doit choisir la filière de la classe cible.' }
      }
      const acceptedCount = enrollments.filter((item) => item.groupId === toGroupId && item.status === 'accepté').length
      if (acceptedCount >= target.maxStudents) return { ok: false, error: 'La classe cible est complète.' }
      const current = enrollments.find((item) => item.studentId === studentId && item.groupId === fromGroupId && item.status === 'accepté')
      if (!current) return { ok: false, error: 'L’élève n’est pas inscrit à la classe source.' }
      const moved: GroupEnrollment = {
        id: makeId('enrollment'), studentId, groupId: toGroupId, status: 'accepté',
        requestedAt: timestamp(), decidedAt: timestamp(),
      }
      await write('groupEnrollments', [
        moved,
        ...enrollments.map((item) => item.id === current.id ? { ...item, status: 'retiré' as const, leftAt: timestamp() } : item),
      ])
      return { ok: true, data: moved }
}

export type GroupStudentSummary = {
    studentId: string
    name: string
    section: string
    progressPercent: number
    lastActivityAt?: string
    attendanceRate: number | null
    averageGrade: number | null
}

export async function getTeacherGroupStudents(groupId: string): Promise<GroupStudentSummary[]> {
    const user = await getCurrentUser()
    const group = (await read('classGroups')).find((item) => item.id === groupId)
    if (!group || user?.role !== 'teacher' && user?.role !== 'admin'
      || user?.role === 'teacher' && group.teacherId !== user.id) return []
    const [enrollments, users, links, attendance, sessions, assessments, grades, activities] = await Promise.all([
      read('groupEnrollments'), read('users'), read('groupContentLinks'), read('groupAttendance'),
      readLiveSessions(), read('groupAssessments'), read('studentGrades'), read('studentActivity'),
    ])
    const enrolled = enrollments.filter((item) => item.groupId === groupId && item.status === 'accepté')
    const groupLessonIds = links.filter((item) => item.groupId === groupId && item.published).flatMap((item) => item.lessonIds)
    const groupSessions = sessions.filter((session) => session.groupId === groupId && session.status === 'ended')
    const publishedAssessments = assessments.filter((assessment) => assessment.groupId === groupId && assessment.published)
    const output: GroupStudentSummary[] = []
    for (const enrollment of enrolled) {
      const student = users.find((item) => item.id === enrollment.studentId && item.role === 'student')
      if (!student) continue
      const completed = await read(`completed:${student.id}`)
      const studentAttendance = attendance.filter((item) => item.groupId === groupId && item.studentId === student.id)
      const presentCount = studentAttendance.filter((item) => item.status === 'présent' || item.status === 'retard').length
      const studentGrades = grades.filter((grade) => grade.studentId === student.id
        && publishedAssessments.some((assessment) => assessment.id === grade.assessmentId))
      const averageGrade = await averageForGrades(studentGrades, publishedAssessments)
      const studentActivities = activities.filter((activity) => activity.studentId === student.id)
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      output.push({
        studentId: student.id, name: privateStudentName(student.name), section: student.section,
        progressPercent: groupLessonIds.length ? Math.round(groupLessonIds.filter((id) => completed.includes(id)).length / groupLessonIds.length * 100) : 0,
        lastActivityAt: studentActivities[0]?.occurredAt,
        attendanceRate: groupSessions.length ? Math.round(presentCount / groupSessions.length * 100) : null,
        averageGrade,
      })
    }
    return output.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

export async function getGroupStudentDetail(groupId: string, studentId: string): Promise<{
    attendance: GroupAttendance[]
    grades: Array<{ assessment: GroupAssessment; grade: StudentGrade }>
    classLog: ClassLogEntry[]
} | undefined> {
    const user = await getCurrentUser()
    const group = (await read('classGroups')).find((item) => item.id === groupId)
    const enrolled = await hasAcceptedGroupEnrollment(studentId, groupId)
    if (!group || !enrolled || user?.role !== 'admin'
      && !(user?.role === 'teacher' && user.id === group.teacherId)
      && !(user?.role === 'student' && user.id === studentId && await hasGroupContentAccess(user.id, groupId))) return undefined
    const [attendance, assessments, grades, classLog] = await Promise.all([
      read('groupAttendance'), read('groupAssessments'), read('studentGrades'), read('classLogEntries'),
    ])
    const studentGrades = grades.filter((grade) => grade.studentId === studentId
      && assessments.some((assessment) => assessment.groupId === groupId && assessment.id === grade.assessmentId && assessment.published))
    return {
      attendance: attendance.filter((entry) => entry.groupId === groupId && entry.studentId === studentId),
      grades: studentGrades.flatMap((grade) => {
        const assessment = assessments.find((item) => item.id === grade.assessmentId)
        return assessment ? [{ assessment, grade }] : []
      }),
      classLog: classLog.filter((entry) => entry.groupId === groupId),
    }
}

async function notifyGroupStudents(groupId: string, type: Notification['type'], title: string, message: string, href: string): Promise<void> {
    const studentIds = (await read('groupEnrollments'))
      .filter((enrollment) => enrollment.groupId === groupId && enrollment.status === 'accepté')
      .map((enrollment) => enrollment.studentId)
    const createdAt = timestamp()
    const notifications = studentIds.map((userId) => ({
      id: makeId('notification'), userId, type, title, message, href, createdAt,
    } satisfies Notification))
    await write('notifications', [...notifications, ...await read('notifications')])
}

export async function createSchedulePoll(
    groupId: string,
    slots: WeeklySlot[],
    deadlineAt: string,
    weeks = 12,
): Promise<ApiResult<SchedulePoll>> {
    const user = await getCurrentUser()
    if (user?.role !== 'teacher') return { ok: false, error: 'Réservé aux enseignants.' }
    const group = (await read('classGroups')).find((item) => item.id === groupId && item.teacherId === user.id)
    const deadline = new Date(deadlineAt)
    if (!group || slots.length < 2 || slots.length > 10 || new Set(slots.map((slot) => slot.id)).size !== slots.length
      || !Number.isFinite(deadline.getTime()) || deadline.getTime() <= Date.now()
      || !Number.isInteger(weeks) || weeks < 1 || weeks > 52
      || slots.some((slot) => !Number.isInteger(slot.dayOfWeek) || slot.dayOfWeek < 0 || slot.dayOfWeek > 6
        || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(slot.startTime)
        || !Number.isInteger(slot.durationMinutes) || slot.durationMinutes < 15 || slot.durationMinutes > 240)) {
      return { ok: false, error: 'Les créneaux proposés sont invalides.' }
    }
    const poll: SchedulePoll = {
      id: makeId('poll'), groupId, teacherId: user.id,
      slots: slots.map((slot) => ({ ...slot, id: slot.id || makeId('slot') })),
      deadlineAt: deadline.toISOString(), status: 'ouvert', selectedSlotIds: [], weeks, createdAt: timestamp(),
    }
    await write('schedulePolls', [poll, ...await read('schedulePolls')])
    await write('classGroups', (await read('classGroups')).map((item) =>
      item.id === groupId ? { ...item, scheduleStatus: 'proposé' as const } : item))
    await notifyGroupStudents(groupId, 'slots-proposed', 'Choix des disponibilités',
      `Votre professeur propose des créneaux pour « ${group.name} ».`, '/student/schedule')
    return { ok: true, data: poll }
}

export async function submitScheduleVote(pollId: string, slotId: string, vote: AvailabilityVote): Promise<ApiResult<SchedulePollVote>> {
    const user = await getCurrentUser()
    if (user?.role !== 'student') return { ok: false, error: 'Réservé aux élèves.' }
    const poll = (await read('schedulePolls')).find((item) => item.id === pollId)
    if (!poll || poll.status !== 'ouvert' || new Date(poll.deadlineAt).getTime() < Date.now()
      || !poll.slots.some((slot) => slot.id === slotId) || !await hasAcceptedGroupEnrollment(user.id, poll.groupId)) {
      return { ok: false, error: 'Ce sondage n’est plus accessible.' }
    }
    const votes = await read('schedulePollVotes')
    const updated: SchedulePollVote = { pollId, slotId, studentId: user.id, vote, updatedAt: timestamp() }
    await write('schedulePollVotes', [
      updated,
      ...votes.filter((item) => item.pollId !== pollId || item.studentId !== user.id || item.slotId !== slotId),
    ])
    return { ok: true, data: updated }
}

export async function getSchedulePollResults(pollId: string): Promise<{
    results: ReturnType<typeof rankWeeklySlots>
    suggestion?: WeeklySlot
} | undefined> {
    const user = await getCurrentUser()
    if (user?.role !== 'teacher' && user?.role !== 'admin') return undefined
    const poll = (await read('schedulePolls')).find((item) => item.id === pollId)
    const group = poll && (await read('classGroups')).find((item) => item.id === poll.groupId)
    if (!poll || !group || user.role === 'teacher' && group.teacherId !== user.id) return undefined
    const [votes, enrollments, users] = await Promise.all([
      read('schedulePollVotes'), read('groupEnrollments'), read('users'),
    ])
    const enrolledIds = new Set(enrollments.filter((item) =>
      item.groupId === group.id && item.status === 'accepté').map((item) => item.studentId))
    const acceptedVotes = votes.filter((vote) => vote.pollId === poll.id && enrolledIds.has(vote.studentId))
    const students = users.filter((item) => enrolledIds.has(item.id) && item.role === 'student')
    const results = rankWeeklySlots(poll.slots, acceptedVotes, students)
    return { results, suggestion: suggestBestWeeklySlot(results) }
}

export async function fixGroupSchedule(
    pollId: string,
    selectedSlotIds: string[],
): Promise<ApiResult<{ sessions: LiveSession[]; conflictWarnings: string[] }>> {
    const user = await getCurrentUser()
    if (user?.role !== 'teacher') return { ok: false, error: 'Réservé aux enseignants.' }
    const polls = await read('schedulePolls')
    const poll = polls.find((item) => item.id === pollId && item.teacherId === user.id && item.status === 'ouvert')
    const group = poll && (await read('classGroups')).find((item) => item.id === poll.groupId && item.teacherId === user.id)
    if (!poll || !group || selectedSlotIds.length === 0 || new Set(selectedSlotIds).size !== selectedSlotIds.length
      || selectedSlotIds.some((id) => !poll.slots.some((slot) => slot.id === id))) {
      return { ok: false, error: 'Sélectionnez un ou plusieurs créneaux valides.' }
    }
    const slots = poll.slots.filter((slot) => selectedSlotIds.includes(slot.id))
    const liveSessions = await readLiveSessions()
    const existingTeacherSessions = liveSessions.filter((session) =>
      session.teacherId === user.id && session.status !== 'cancelled')
    const planned: LiveSession[] = []
    for (const slot of slots) {
      const dates = generateWeeklySessionDates(slot, poll.weeks, new Date())
      for (const date of dates) {
        const candidate: LiveSession = {
          id: makeId('session'), title: group.name, description: `Séance hebdomadaire — ${group.name}`,
          subjectId: group.subjectId, groupId: group.id, teacherId: user.id, date, startTime: slot.startTime,
          durationMinutes: slot.durationMinutes, provider: 'livekit', status: 'scheduled', resources: [], createdAt: timestamp(),
        }
        if (hasSessionConflict(candidate, [...existingTeacherSessions, ...planned])) {
          return { ok: false, error: `Conflit d’horaire enseignant le ${date} à ${slot.startTime}.` }
        }
        planned.push(candidate)
      }
    }
    const enrollments = (await read('groupEnrollments')).filter((item) =>
      item.groupId === group.id && item.status === 'accepté')
    const studentGroups = (await read('groupEnrollments')).filter((item) =>
      enrollments.some((enrollment) => enrollment.studentId === item.studentId) && item.status === 'accepté')
    const groupById = new Map((await read('classGroups')).map((item) => [item.id, item]))
    const conflictStudentIds = new Set<string>()
    for (const session of planned) {
      const conflicts = liveSessions.filter((existing) => existing.groupId && existing.groupId !== group.id
        && existing.status !== 'cancelled' && hasSessionConflict(session, [existing]))
      for (const enrollment of studentGroups) {
        if (conflicts.some((conflict) => groupById.get(conflict.groupId!)?.teacherId !== user.id
          && studentGroups.some((other) => other.studentId === enrollment.studentId && other.groupId === conflict.groupId))) {
          conflictStudentIds.add(enrollment.studentId)
        }
      }
    }
    const users = await read('users')
    const conflictWarnings = [...conflictStudentIds].flatMap((studentId) => {
      const student = users.find((item) => item.id === studentId)
      return student ? [privateStudentName(student.name)] : []
    })
    await write('liveSessions', [...planned, ...liveSessions])
    await write('schedulePolls', polls.map((item) => item.id === pollId
      ? { ...item, status: 'fixé' as const, selectedSlotIds } : item))
    await write('classGroups', (await read('classGroups')).map((item) =>
      item.id === group.id ? { ...item, scheduleStatus: 'fixé' as const } : item))
    await notifyGroupStudents(group.id, 'schedule-fixed', 'Créneaux fixés',
      `Les séances hebdomadaires de « ${group.name} » sont maintenant planifiées.`, '/student/schedule')
    return { ok: true, data: { sessions: planned, conflictWarnings } }
}

export async function rescheduleGroupSession(
    sessionId: string,
    changes: { date?: string; startTime?: string; durationMinutes?: number; cancel?: boolean },
    reason: string,
): Promise<ApiResult<LiveSession>> {
    const user = await getCurrentUser()
    if (user?.role !== 'teacher' || reason.trim().length < 5) return { ok: false, error: 'Indiquez un motif de reprogrammation.' }
    const sessions = await readLiveSessions()
    const session = sessions.find((item) => item.id === sessionId && item.teacherId === user.id && item.groupId)
    if (!session) return { ok: false, error: 'Séance inaccessible.' }
    const { cancel, ...sessionChanges } = changes
    const next = {
      ...session, ...sessionChanges,
      status: cancel ? 'cancelled' as const : session.status,
      changeReason: reason.trim(),
    }
    if (!liveSessionSchema.safeParse(next).success) return { ok: false, error: 'Les nouvelles informations de séance sont invalides.' }
    if (!cancel && next.date < todayInTunis()) return { ok: false, error: 'La nouvelle date doit être aujourd’hui ou ultérieure.' }
    if (!cancel) {
      const conflict = sessions.some((other) => other.id !== session.id && other.teacherId === user.id
        && other.status !== 'cancelled' && hasSessionConflict(next, [other]))
      if (conflict) return { ok: false, error: 'Ce créneau chevauche une autre séance que vous animez.' }
    }
    await write('liveSessions', sessions.map((item) => item.id === sessionId ? next : item))
    const type = cancel ? 'session-cancelled' : 'session-rescheduled'
    await notifyGroupStudents(session.groupId!, type,
      cancel ? 'Séance annulée' : 'Séance modifiée',
      `La séance a été ${cancel ? 'annulée' : 'reprogrammée'}. Motif : ${reason.trim()}`,
      '/student/schedule')
    return { ok: true, data: next }
}

export async function requestGroupReschedule(
    sessionId: string,
    reason: string,
    proposedDate?: string,
    proposedStartTime?: string,
): Promise<ApiResult<GroupRescheduleRequest>> {
    const user = await getCurrentUser()
    if (user?.role !== 'student' || reason.trim().length < 5) return { ok: false, error: 'Indiquez le motif de votre demande.' }
    const session = (await readLiveSessions()).find((item) => item.id === sessionId && item.groupId)
    if (!session?.groupId || !await hasAcceptedGroupEnrollment(user.id, session.groupId)) return { ok: false, error: 'Séance inaccessible.' }
    if (Boolean(proposedDate) !== Boolean(proposedStartTime)
      || proposedDate && (!/^\d{4}-\d{2}-\d{2}$/.test(proposedDate) || proposedDate < todayInTunis())
      || proposedStartTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(proposedStartTime)) {
      return { ok: false, error: 'Le créneau proposé est invalide.' }
    }
    const request: GroupRescheduleRequest = {
      id: makeId('reschedule'), groupId: session.groupId, sessionId, requesterId: user.id,
      reason: reason.trim(), status: 'en attente', createdAt: timestamp(),
      ...(proposedDate ? { proposedDate } : {}), ...(proposedStartTime ? { proposedStartTime } : {}),
    }
    await write('groupRescheduleRequests', [request, ...await read('groupRescheduleRequests')])
    const group = (await read('classGroups')).find((item) => item.id === session.groupId)
    if (group) await notifyUser(group.teacherId, 'session-rescheduled', 'Demande de changement de séance',
      `${privateStudentName(user.name)} demande un changement : ${reason.trim()}.`, '/teacher/groups')
    return { ok: true, data: request }
}

export async function getTeacherRescheduleRequests(): Promise<Array<{
    request: GroupRescheduleRequest
    groupName: string
    sessionTitle: string
    studentName: string
}>> {
    const user = await getCurrentUser()
    if (user?.role !== 'teacher') return []
    const [requests, groups, sessions, users] = await Promise.all([
      read('groupRescheduleRequests'), read('classGroups'), readLiveSessions(), read('users'),
    ])
    return requests.filter((request) => request.status === 'en attente')
      .flatMap((request) => {
        const group = groups.find((item) => item.id === request.groupId && item.teacherId === user.id)
        const session = request.sessionId && sessions.find((item) => item.id === request.sessionId)
        const student = users.find((item) => item.id === request.requesterId && item.role === 'student')
        return group && session && student ? [{
          request, groupName: group.name, sessionTitle: session.title,
          studentName: privateStudentName(student.name),
        }] : []
      })
}

export async function decideGroupRescheduleRequest(
    requestId: string,
    decision: 'accepté' | 'refusé',
): Promise<ApiResult<GroupRescheduleRequest>> {
    const user = await getCurrentUser()
    if (user?.role !== 'teacher') return { ok: false, error: 'Réservé aux enseignants.' }
    const requests = await read('groupRescheduleRequests')
    const request = requests.find((item) => item.id === requestId && item.status === 'en attente')
    const group = request && (await read('classGroups')).find((item) =>
      item.id === request.groupId && item.teacherId === user.id)
    if (!request || !group) return { ok: false, error: 'Demande inaccessible.' }
    if (decision === 'accepté' && request.sessionId && request.proposedDate && request.proposedStartTime) {
      const moved = await rescheduleGroupSession(request.sessionId, {
        date: request.proposedDate, startTime: request.proposedStartTime,
      }, request.reason)
      if (!moved.ok) return { ok: false, error: moved.error }
    }
    const updated = { ...request, status: decision }
    await write('groupRescheduleRequests', requests.map((item) => item.id === requestId ? updated : item))
    await notifyUser(request.requesterId, 'session-rescheduled',
      decision === 'accepté' ? 'Demande de changement acceptée' : 'Demande de changement refusée',
      decision === 'accepté' ? `Votre demande pour « ${group.name} » a été acceptée.`
        : `Votre demande pour « ${group.name} » a été refusée.`,
      '/student/schedule')
    return { ok: true, data: updated }
}

export async function getGroupSessionRoster(sessionId: string): Promise<Array<{ studentId: string; name: string; status: GroupAttendance['status'] }>> {
    const user = await getCurrentUser()
    const session = (await readLiveSessions()).find((item) => item.id === sessionId && item.groupId)
    if (!session?.groupId || !user) return []
    if (user.role === 'teacher' && user.id !== session.teacherId
      || user.role === 'student' && !await hasGroupContentAccess(user.id, session.groupId)) return []
    const enrolled = (await read('groupEnrollments')).filter((item) =>
      item.groupId === session.groupId && item.status === 'accepté')
    const [users, savedAttendance, liveAttendance] = await Promise.all([
      read('users'), read('groupAttendance'), read('liveAttendance'),
    ])
    return enrolled.flatMap((enrollment) => {
      if (user.role === 'student' && user.id !== enrollment.studentId) return []
      const student = users.find((item) => item.id === enrollment.studentId)
      if (!student) return []
      const existing = savedAttendance.find((item) => item.sessionId === sessionId && item.studentId === student.id)
      const presentInRoom = liveAttendance.some((item) => item.sessionId === sessionId && item.studentId === student.id)
      return [{
        studentId: student.id, name: privateStudentName(student.name),
        status: existing?.status ?? (presentInRoom ? 'présent' : 'absent'),
      }]
    })
}

export async function closeGroupSession(
    sessionId: string,
    input: {
      attendance: Array<{ studentId: string; status: GroupAttendance['status'] }>
      coveredLessonIds: string[]
      summary: string
      homework?: Pick<HomeworkAssignment, 'title' | 'instructions' | 'dueAt' | 'maxPoints' | 'allowedTypes'>
    },
): Promise<ApiResult<ClassLogEntry>> {
    const user = await getCurrentUser()
    if (user?.role !== 'teacher') return { ok: false, error: 'Réservé aux enseignants.' }
    const session = (await readLiveSessions()).find((item) => item.id === sessionId && item.teacherId === user.id && item.groupId)
    if (!session?.groupId) return { ok: false, error: 'Séance inaccessible.' }
    if (session.status === 'cancelled' || session.status === 'ended'
      || session.status === 'scheduled' && liveSessionStart(session).getTime() > Date.now()) {
      return { ok: false, error: 'Cette séance ne peut pas encore être clôturée.' }
    }
    if (input.homework) {
      const dueDate = Date.parse(input.homework.dueAt)
      const validTypes = ['text', 'image', 'pdf']
      if (input.homework.title.trim().length < 2 || input.homework.title.length > 120
        || input.homework.instructions.trim().length < 2 || input.homework.instructions.length > 5000
        || !Number.isFinite(dueDate) || !Number.isFinite(input.homework.maxPoints)
        || input.homework.maxPoints <= 0 || input.homework.maxPoints > 1000
        || input.homework.allowedTypes.length === 0
        || input.homework.allowedTypes.some((type) => !validTypes.includes(type))
        || new Set(input.homework.allowedTypes).size !== input.homework.allowedTypes.length) {
        return { ok: false, error: 'Les informations du devoir sont invalides.' }
      }
    }
    const groupEnrollments = (await read('groupEnrollments')).filter((item) =>
      item.groupId === session.groupId && item.status === 'accepté')
    const studentIds = new Set(groupEnrollments.map((item) => item.studentId))
    const attendanceStatuses: GroupAttendance['status'][] = ['présent', 'absent', 'retard', 'absent justifié']
    if (input.attendance.length !== studentIds.size || input.attendance.some((row) =>
      !studentIds.has(row.studentId) || !attendanceStatuses.includes(row.status))
      || new Set(input.attendance.map((row) => row.studentId)).size !== input.attendance.length) {
      return { ok: false, error: 'La liste de présence ne correspond pas aux élèves inscrits.' }
    }
    const links = (await read('groupContentLinks')).filter((item) => item.groupId === session.groupId)
    const allowedLessons = new Set(links.flatMap((item) => item.lessonIds))
    if (input.coveredLessonIds.some((id) => !allowedLessons.has(id)) || input.summary.length > 4000) {
      return { ok: false, error: 'Le cahier de textes contient des éléments invalides.' }
    }
    const safeSummary = maskContactInfo(input.summary.trim())
    const entry: ClassLogEntry = {
      id: makeId('class-log'), groupId: session.groupId, sessionId, teacherId: user.id,
      coveredLessonIds: input.coveredLessonIds, summary: safeSummary.text, createdAt: timestamp(),
    }
    const attendance = (await read('groupAttendance')).filter((item) => item.sessionId !== sessionId)
    const sessions = await readLiveSessions()
    await write('liveSessions', sessions.map((item) => item.id === sessionId ? { ...item, status: 'ended' as const } : item))
    await write('groupAttendance', [...attendance, ...input.attendance.map((row) => ({
      groupId: session.groupId!, sessionId, studentId: row.studentId, status: row.status, markedAt: timestamp(),
    }))])
    await write('classLogEntries', [entry, ...await read('classLogEntries')])
    if (input.homework) {
      const safeTitle = maskContactInfo(input.homework.title.trim())
      const safeInstructions = maskContactInfo(input.homework.instructions.trim())
      const assignment: HomeworkAssignment = {
        ...input.homework, title: safeTitle.text, instructions: safeInstructions.text,
        id: makeId('homework'), teacherId: user.id, groupId: session.groupId,
        lessonId: input.coveredLessonIds[0], createdAt: timestamp(),
      }
      await write('homeworkAssignments', [assignment, ...await read('homeworkAssignments')])
      await notifyGroupStudents(session.groupId, 'announcement', 'Nouveau devoir',
        `Un nouveau devoir a été ajouté à la classe.`, '/student/homework')
      if (safeTitle.masked || safeInstructions.masked) {
        await createSystemReport('comment', assignment.id, 'Coordonnées détectées et masquées automatiquement.')
      }
    }
    if (safeSummary.masked) await createSystemReport('comment', entry.id, 'Coordonnées détectées et masquées automatiquement.')
    return { ok: true, data: entry }
}

async function averageForGrades(grades: StudentGrade[], assessments: GroupAssessment[]): Promise<number | null> {
    const assessmentMap = new Map(assessments.map((assessment) => [assessment.id, assessment]))
    return calculateGroupAverage(grades.flatMap((grade) => {
      const assessment = assessmentMap.get(grade.assessmentId)
      return assessment ? [{
        score: grade.score, maxPoints: assessment.maxPoints, coefficient: assessment.coefficient,
        type: assessment.type, absent: grade.absent,
      }] : []
    }))
}

export async function createGroupAssessment(input: Omit<GroupAssessment, 'id' | 'teacherId' | 'createdAt'>): Promise<ApiResult<GroupAssessment>> {
    const user = await getCurrentUser()
    if (user?.role !== 'teacher') return { ok: false, error: 'Réservé aux enseignants.' }
    const group = (await read('classGroups')).find((item) => item.id === input.groupId && item.teacherId === user.id)
    if (!group || !input.title.trim() || !Number.isFinite(input.maxPoints) || input.maxPoints <= 0
      || input.maxPoints > 1000 || !Number.isFinite(input.coefficient) || input.coefficient <= 0
      || input.coefficient > 100 || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      return { ok: false, error: 'Les informations de l’évaluation sont invalides.' }
    }
    const assessment: GroupAssessment = { ...input, id: makeId('assessment'), teacherId: user.id, createdAt: timestamp() }
    await write('groupAssessments', [assessment, ...await read('groupAssessments')])
    return { ok: true, data: assessment }
}

export async function recordStudentGrade(
    assessmentId: string,
    studentId: string,
    score: number | undefined,
    absent: boolean,
    reason: string,
): Promise<ApiResult<StudentGrade>> {
    const user = await getCurrentUser()
    if (user?.role !== 'teacher') return { ok: false, error: 'Réservé aux enseignants.' }
    const assessments = await read('groupAssessments')
    const assessment = assessments.find((item) => item.id === assessmentId && item.teacherId === user.id)
    if (!assessment || !await hasAcceptedGroupEnrollment(studentId, assessment.groupId)
      || absent && score !== undefined || !absent && (score === undefined || !Number.isFinite(score) || score < 0 || score > assessment.maxPoints)) {
      return { ok: false, error: 'La note ou l’élève est invalide.' }
    }
    const grades = await read('studentGrades')
    const existing = grades.find((item) => item.assessmentId === assessmentId && item.studentId === studentId)
    if (existing && (existing.score !== score || existing.absent !== absent) && reason.trim().length < 5) {
      return { ok: false, error: 'Indiquez le motif de la correction de note.' }
    }
    const updated: StudentGrade = {
      id: existing?.id ?? makeId('grade'), assessmentId, studentId,
      ...(score === undefined ? {} : { score }), absent, updatedAt: timestamp(),
    }
    if (existing && (existing.score !== score || existing.absent !== absent)) {
      const audit = {
        id: makeId('grade-audit'), gradeId: existing.id, teacherId: user.id,
        ...(existing.score === undefined ? {} : { previousScore: existing.score }),
        ...(score === undefined ? {} : { nextScore: score }), reason: reason.trim(), createdAt: timestamp(),
      }
      await write('gradeAuditLog', [audit, ...await read('gradeAuditLog')])
    }
    await write('studentGrades', [
      updated, ...grades.filter((item) => item.id !== updated.id),
    ])
    await notifyUser(studentId, 'grade-published', 'Nouvelle note publiée',
      `Votre note pour « ${assessment.title} » est disponible.`, '/student/record')
    return { ok: true, data: updated }
}

export async function getGroupGrades(groupId: string): Promise<{
    assessments: GroupAssessment[]
    grades: StudentGrade[]
    average: number | null
    distribution: [number, number, number, number]
} | undefined> {
    const user = await getCurrentUser()
    const group = (await read('classGroups')).find((item) => item.id === groupId)
    if (!group || user?.role !== 'student' && user?.role !== 'admin' && user?.role !== 'teacher'
      || user?.role === 'teacher' && group.teacherId !== user.id
      || user?.role === 'student' && !await hasGroupContentAccess(user.id, groupId)) return undefined
    const [assessments, allGrades] = await Promise.all([read('groupAssessments'), read('studentGrades')])
    const visibleAssessments = assessments.filter((item) => item.groupId === groupId && (user.role !== 'student' || item.published))
    const grades = allGrades.filter((grade) => visibleAssessments.some((item) => item.id === grade.assessmentId)
      && (user.role !== 'student' || grade.studentId === user.id))
    const average = await averageForGrades(grades, visibleAssessments)
    const scored = grades.flatMap((grade) => {
      const assessment = visibleAssessments.find((item) => item.id === grade.assessmentId)
      return grade.score !== undefined && assessment ? [grade.score / assessment.maxPoints * 20] : []
    })
    return { assessments: visibleAssessments, grades, average, distribution: getGradeDistribution(scored) }
}

export async function publishGroupAnnouncement(
    groupId: string,
    input: { title: string; body: string; pinned?: boolean },
): Promise<ApiResult<GroupAnnouncement>> {
    const user = await getCurrentUser()
    if (user?.role !== 'teacher') return { ok: false, error: 'Réservé aux enseignants.' }
    const group = (await read('classGroups')).find((item) => item.id === groupId && item.teacherId === user.id)
    if (!group || input.title.trim().length < 2 || input.title.length > 120 || input.body.trim().length < 2 || input.body.length > 5000) {
      return { ok: false, error: 'L’annonce est invalide.' }
    }
    const safeTitle = maskContactInfo(input.title.trim())
    const safeBody = maskContactInfo(input.body.trim())
    const announcement: GroupAnnouncement = {
      id: makeId('group-announcement'), groupId, teacherId: user.id,
      title: safeTitle.text, body: safeBody.text, pinned: input.pinned === true, createdAt: timestamp(),
    }
    await write('groupAnnouncements', [announcement, ...await read('groupAnnouncements')])
    await notifyGroupStudents(groupId, 'announcement', 'Nouvelle annonce de classe',
      `Une annonce a été publiée dans « ${group.name} ».`, '/student/groups')
    if (safeTitle.masked || safeBody.masked) {
      await createSystemReport('announcement', announcement.id, 'Coordonnées détectées et masquées automatiquement.')
    }
    return { ok: true, data: announcement }
}

export async function getGroupAnnouncements(groupId: string): Promise<GroupAnnouncement[]> {
    const user = await getCurrentUser()
    const group = (await read('classGroups')).find((item) => item.id === groupId)
    if (!group || user?.role === 'teacher' && group.teacherId !== user.id
      || user?.role === 'student' && !await hasGroupContentAccess(user.id, groupId)
      || user?.role !== 'admin' && user?.role !== 'teacher' && user?.role !== 'student') return []
    return (await read('groupAnnouncements')).filter((item) => item.groupId === groupId && !item.hidden)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt))
}

export async function submitGroupPayment(
    groupId: string,
    period: string,
    receipt: string,
    receiptType = 'image/jpeg',
): Promise<ApiResult<GroupPayment>> {
    const settings = await getSettings()
    if (!settings.paymentsEnabled) return { ok: false, error: 'Les paiements sont désactivés.' }
    const user = await getCurrentUser()
    if (user?.role !== 'student' || !await hasAcceptedGroupEnrollment(user.id, groupId)) {
      return { ok: false, error: 'Inscription acceptée requise.' }
    }
    const group = (await read('classGroups')).find((item) => item.id === groupId)
    if (!group || group.monthlyPrice === null || group.monthlyPrice <= 0) {
      return { ok: false, error: 'Cette classe ne demande pas de paiement.' }
    }
    const match = receipt.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/)
    if (!/^\d{4}-\d{2}$/.test(period) || !match || match[1] !== receiptType
      || !/^image\/(png|jpeg|webp)$|^application\/pdf$/.test(receiptType)
      || Math.floor(match[2].length * 3 / 4) > 3 * 1024 * 1024 || !validFileSignature(match[2], receiptType)) {
      return { ok: false, error: 'Le reçu doit être une image ou un PDF valide de 3 Mo maximum.' }
    }
    const payments = await read('groupPayments')
    const existing = payments.find((payment) => payment.groupId === groupId && payment.studentId === user.id && payment.period === period)
    if (existing?.status === 'payé') return { ok: false, error: 'Cette période est déjà réglée.' }
    const payment: GroupPayment = {
      id: existing?.id ?? makeId('group-payment'), groupId, studentId: user.id, period,
      status: 'en attente', receipt, submittedAt: timestamp(),
    }
    await write('groupPayments', [payment, ...payments.filter((item) => item.id !== payment.id)])
    return { ok: true, data: payment }
}

export async function getMyGroupPayments(groupId?: string): Promise<GroupPayment[]> {
    const user = await getCurrentUser()
    if (user?.role !== 'student' || !(await getSettings()).paymentsEnabled) return []
    return (await read('groupPayments')).filter((payment) =>
      payment.studentId === user.id && (!groupId || payment.groupId === groupId))
}

export async function getAdminGroupPayments(): Promise<Array<{
    payment: GroupPayment
    groupName: string
    studentName: string
}>> {
    const user = await getCurrentUser()
    if (user?.role !== 'admin' || !(await getSettings()).paymentsEnabled) return []
    const [payments, groups, users] = await Promise.all([
      read('groupPayments'), read('classGroups'), read('users'),
    ])
    return payments.flatMap((payment) => {
      const group = groups.find((item) => item.id === payment.groupId)
      const student = users.find((item) => item.id === payment.studentId && item.role === 'student')
      return group && student ? [{ payment, groupName: group.name, studentName: student.name }] : []
    })
}

export async function reviewGroupPayment(
    paymentId: string,
    status: GroupPayment['status'],
): Promise<ApiResult<GroupPayment>> {
    const user = await getCurrentUser()
    if (user?.role !== 'admin') return { ok: false, error: 'Réservé à l’administration.' }
    if (!(await getSettings()).paymentsEnabled) return { ok: false, error: 'Les paiements sont désactivés.' }
    const payments = await read('groupPayments')
    const payment = payments.find((item) => item.id === paymentId)
    if (!payment || payment.status === 'payé' && status !== 'payé') return { ok: false, error: 'Paiement introuvable ou déjà validé.' }
    const updated = { ...payment, status, decidedAt: timestamp() }
    await write('groupPayments', payments.map((item) => item.id === paymentId ? updated : item))
    await notifyUser(payment.studentId, 'group-payment', 'Statut du paiement mis à jour',
      `Le paiement de ${payment.period} est marqué « ${status} ».`, '/student/groups')
    return { ok: true, data: updated }
}

export async function getGroupAdminOverview(): Promise<{
    studentsPerSection: Array<{ section: BacSection; count: number }>
    groups: Array<{ group: ClassGroup; accepted: number; capacityPercent: number }>
    attendanceRate: number | null
    paymentStatuses: Record<GroupPayment['status'], number>
} | undefined> {
    const user = await getCurrentUser()
    if (user?.role !== 'admin') return undefined
    const [sections, users, groups, enrollments, attendance, payments] = await Promise.all([
      read('sections'), read('users'), read('classGroups'), read('groupEnrollments'),
      read('groupAttendance'), read('groupPayments'),
    ])
    const paymentsEnabled = Boolean((await getSettings()).paymentsEnabled)
    const students = users.filter((item) => item.role === 'student')
    const groupStats = groups.map((group) => {
      const accepted = enrollments.filter((item) => item.groupId === group.id && item.status === 'accepté').length
      return { group: groupForViewer(group, paymentsEnabled), accepted, capacityPercent: Math.round(accepted / group.maxStudents * 100) }
    })
    const attended = attendance.filter((item) => item.status === 'présent' || item.status === 'retard').length
    const paymentStatuses: Record<GroupPayment['status'], number> = { payé: 0, 'en attente': 0, 'en retard': 0 }
    if (paymentsEnabled) {
      for (const payment of payments) paymentStatuses[payment.status] += 1
    }
    return {
      studentsPerSection: sections.map((section) => ({
        section, count: students.filter((student) => student.sectionId === section.id || student.section === section.name).length,
      })),
      groups: groupStats,
      attendanceRate: attendance.length ? Math.round(attended / attendance.length * 100) : null,
      paymentStatuses,
    }
}

export async function createTeacherAccount(input: Omit<User, 'id' | 'role'>): Promise<ApiResult<User>> {
  const admin = await getCurrentUser()
  if (admin?.role !== 'admin') return { ok: false, error: 'Admin permission required' }
  if (input.name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || !/^\+?[\d\s()-]{8,}$/.test(input.phone)) return { ok: false, error: 'Invalid teacher details' }
  const users = await getUsers()
  if (users.some((user) => user.email.toLowerCase() === input.email.toLowerCase()
    || user.phone.replace(/\s/g, '') === input.phone.replace(/\s/g, ''))) return { ok: false, error: 'This email or phone is already registered' }
  const teacher: User = { ...input, id: `teacher-${Date.now()}`, role: 'teacher' }
  await write('users', [...users, teacher])
  return { ok: true, data: teacher }
}

export async function assignTeacherSubjects(input: TeacherAssignment): Promise<ApiResult<TeacherAssignment>> {
  const admin = await getCurrentUser()
  if (admin?.role !== 'admin') return { ok: false, error: 'Admin permission required' }
  const teacher = (await getUsers()).find((user) => user.id === input.teacherId && user.role === 'teacher')
  if (!teacher) return { ok: false, error: 'Teacher not found' }
  const catalog = await read('subjects')
  if (input.subjectIds.some((id) => !catalog.some((subject) => subject.id === id))) return { ok: false, error: 'Unknown subject' }
  const assignments = await read('teacherAssignments')
  assignments[input.teacherId] = input.subjectIds
  await write('teacherAssignments', assignments)
  return { ok: true, data: input }
}

export async function getTeacherAssignments(teacherId: string): Promise<string[]> {
  const admin = await getCurrentUser()
  if (admin?.role !== 'admin') return []
  const teacher = (await getUsers()).find((user) => user.id === teacherId && user.role === 'teacher')
  if (!teacher) return []
  return (await read('teacherAssignments'))[teacherId] ?? []
}

export async function getMyTeachingSubjectIds(): Promise<string[]> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher') return []
  const [subjects, assignments] = await Promise.all([read('subjects'), read('teacherAssignments')])
  return [...new Set([
    ...subjects.filter((subject) => subject.ownerIds.includes(user.id)).map((subject) => subject.id),
    ...(assignments[user.id] ?? []),
  ])]
}

export async function getAdminMetrics(): Promise<{ students: number; activeSubscriptions: number; revenue: number; pendingPayments: number; lessons: number; liveSessionsThisMonth: number }> {
  const admin = await getCurrentUser()
  if (admin?.role !== 'admin') return { students: 0, activeSubscriptions: 0, revenue: 0, pendingPayments: 0, lessons: 0, liveSessionsThisMonth: 0 }
  const users = await getUsers()
  const payments = await getPayments()
  const subscriptions = await Promise.all(users.filter((user) => user.role === 'student').map((user) => read(`subscription:${user.id}`)))
  return {
    students: users.filter((user) => user.role === 'student' && !user.blocked).length,
    activeSubscriptions: subscriptions.filter((subscription) => subscription.status === 'Active'
      && (!subscription.expiresAt || new Date(`${subscription.expiresAt}T23:59:59.999`).getTime() >= Date.now())).length,
    revenue: payments.filter((payment) => payment.status === 'Approved').reduce((total, payment) => total + payment.amount, 0),
    pendingPayments: payments.filter((payment) => payment.status === 'Pending').length,
    lessons: (await allLessons()).length,
    liveSessionsThisMonth: (await readLiveSessions()).filter((session) => session.date.startsWith(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7),
    )).length,
  }
}

type PublicTeacher = {
  id: string
  name: string
  photoUrl: string
  bio: string
  specialties: string[]
  subjectIds: string[]
  lessonCount: number
  followerCount: number
  averageRating: number | null
  upcomingSessions: LiveSession[]
}

async function teacherSubjectIds(teacherId: string): Promise<string[]> {
  const [catalog, assignments, profiles] = await Promise.all([
    read('subjects'), read('teacherAssignments'), read('teacherProfiles'),
  ])
  return [...new Set([
    ...(assignments[teacherId] ?? []),
    ...profiles.find((profile) => profile.teacherId === teacherId)?.subjectIds ?? [],
    ...catalog.filter((subject) => subject.ownerIds.includes(teacherId)).map((subject) => subject.id),
  ])]
}

async function publicTeacher(teacherId: string): Promise<PublicTeacher | undefined> {
  const [teacher, profiles, lessons, follows, ratings, sessions, subjectIds] = await Promise.all([
    read('users').then((users) => users.find((user) => user.id === teacherId && user.role === 'teacher')),
    read('teacherProfiles'), getTeacherLessonsForId(teacherId), read('teacherFollows'),
    read('lessonRatings'), readLiveSessions(), teacherSubjectIds(teacherId),
  ])
  if (!teacher) return undefined
  const profile = profiles.find((item) => item.teacherId === teacherId)
  const publishedLessons = lessons.filter((lesson) => lesson.status === 'published')
  const visibleRatings = ratings.filter((rating) => rating.teacherId === teacherId && !rating.hidden)
  const now = Date.now()
  return {
    id: teacher.id,
    name: teacher.name,
    photoUrl: profile?.photoUrl ?? '',
    bio: profile?.bio ?? '',
    specialties: profile?.specialties ?? [],
    subjectIds,
    lessonCount: publishedLessons.length,
    followerCount: follows.filter((follow) => follow.teacherId === teacherId).length,
    averageRating: visibleRatings.length
      ? Math.round(visibleRatings.reduce((sum, rating) => sum + rating.stars, 0) / visibleRatings.length * 10) / 10
      : null,
    upcomingSessions: sessions.filter((session) => session.teacherId === teacherId && session.status === 'scheduled'
      && new Date(`${session.date}T${session.startTime}:00`).getTime() >= now)
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
  }
}

async function getTeacherLessonsForId(teacherId: string): Promise<Lesson[]> {
  return (await allLessons()).filter((lesson) => lesson.ownerId === teacherId)
}

export async function listTeachers(query = '', subjectId = ''): Promise<PublicTeacher[]> {
  const users = (await read('users')).filter((user) => user.role === 'teacher' && !user.blocked)
  const normalized = query.trim().toLocaleLowerCase('fr-FR')
  const profiles = await Promise.all(users.map((user) => publicTeacher(user.id)))
  return profiles.filter((profile): profile is PublicTeacher => Boolean(profile))
    .filter((profile) => (!subjectId || profile.subjectIds.includes(subjectId))
      && (!normalized || `${profile.name} ${profile.bio} ${profile.specialties.join(' ')}`
        .toLocaleLowerCase('fr-FR').includes(normalized)))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

export async function getTeacherProfile(teacherId: string): Promise<PublicTeacher | undefined> {
  return publicTeacher(teacherId)
}

export async function saveTeacherProfile(input: Omit<TeacherProfile, 'teacherId' | 'updatedAt'>): Promise<ApiResult<TeacherProfile>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher') return { ok: false, error: 'Réservé aux enseignants.' }
  const subjectIds = await teacherSubjectIds(user.id)
  if (input.bio.length > 3000 || input.specialties.length > 20
    || input.specialties.some((specialty) => specialty.trim().length > 80)
    || input.subjectIds.some((id) => !subjectIds.includes(id))
    || input.photoUrl && !/^https:\/\//i.test(input.photoUrl)) {
    return { ok: false, error: 'Les informations du profil sont invalides.' }
  }
  const profiles = await read('teacherProfiles')
  const profile: TeacherProfile = {
    ...input,
    bio: input.bio.trim(),
    specialties: [...new Set(input.specialties.map((value) => value.trim()).filter(Boolean))],
    subjectIds: [...new Set(input.subjectIds)],
    teacherId: user.id,
    updatedAt: timestamp(),
  }
  await write('teacherProfiles', [profile, ...profiles.filter((item) => item.teacherId !== user.id)])
  return { ok: true, data: profile }
}

export async function followTeacher(teacherId: string): Promise<ApiResult<TeacherFollow>> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') return { ok: false, error: 'Réservé aux élèves.' }
  if (!(await read('users')).some((item) => item.id === teacherId && item.role === 'teacher' && !item.blocked)) {
    return { ok: false, error: 'Enseignant introuvable.' }
  }
  const follows = await read('teacherFollows')
  const existing = follows.find((item) => item.teacherId === teacherId && item.studentId === user.id)
  if (existing) return { ok: true, data: existing }
  const follow = { teacherId, studentId: user.id, followedAt: timestamp(), lastVisitedAt: timestamp() }
  await write('teacherFollows', [...follows, follow])
  return { ok: true, data: follow }
}

export async function unfollowTeacher(teacherId: string): Promise<ApiResult<void>> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') return { ok: false, error: 'Réservé aux élèves.' }
  await write('teacherFollows', (await read('teacherFollows'))
    .filter((item) => item.studentId !== user.id || item.teacherId !== teacherId))
  return { ok: true, data: undefined }
}

export async function enrollInSubject(subjectId: string): Promise<ApiResult<StudentSubjectEnrollment>> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') return { ok: false, error: 'Réservé aux élèves.' }
  const subject = (await read('subjects')).find((item) => item.id === subjectId && item.status === 'published')
  if (!subject) return { ok: false, error: 'Matière introuvable.' }
  const rows = await read('subjectEnrollments')
  const existing = rows.find((item) => item.studentId === user.id && item.subjectId === subjectId)
  if (existing) return { ok: true, data: existing }
  const enrollment: StudentSubjectEnrollment = { studentId: user.id, subjectId, enrolledAt: timestamp() }
  await write('subjectEnrollments', [...rows, enrollment])
  return { ok: true, data: enrollment }
}

export async function getMySubjectEnrollments(): Promise<StudentSubjectEnrollment[]> {
  const user = await getCurrentUser()
  return user?.role === 'student'
    ? (await read('subjectEnrollments')).filter((item) => item.studentId === user.id) : []
}

export async function getMyTeachers(): Promise<Array<PublicTeacher & { newLessonCount: number }>> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') return []
  const follows = (await read('teacherFollows')).filter((item) => item.studentId === user.id)
  const output = await Promise.all(follows.map(async (follow) => {
    const [profile, lessons] = await Promise.all([
      publicTeacher(follow.teacherId), getTeacherLessonsForId(follow.teacherId),
    ])
    if (!profile) return undefined
    const newLessonCount = lessons.filter((lesson) => lesson.status === 'published'
      && lesson.createdAt > follow.lastVisitedAt).length
    return { ...profile, newLessonCount }
  }))
  await write('teacherFollows', (await read('teacherFollows')).map((item) =>
    item.studentId === user.id ? { ...item, lastVisitedAt: timestamp() } : item))
  return output.filter((item): item is PublicTeacher & { newLessonCount: number } => Boolean(item))
}

export async function rateLesson(lessonId: string, stars: number, comment = ''): Promise<ApiResult<LessonRating>> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') return { ok: false, error: 'Réservé aux élèves.' }
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return { ok: false, error: 'La note doit être comprise entre 1 et 5.' }
  if (!(await read(`completed:${user.id}`)).includes(lessonId)) return { ok: false, error: 'Terminez la leçon avant de la noter.' }
  const lesson = (await allLessons()).find((item) => item.id === lessonId && item.status === 'published')
  if (!lesson) return { ok: false, error: 'Leçon introuvable.' }
  if (comment.trim().length > 2000) return { ok: false, error: 'Le commentaire est trop long.' }
  if (!await withinInteractionLimit(user.id)) return { ok: false, error: 'La limite de messages et questions par heure est atteinte.' }
  const safe = maskContactInfo(comment)
  const ratings = await read('lessonRatings')
  const existing = ratings.find((rating) => rating.lessonId === lessonId && rating.studentId === user.id)
  const now = timestamp()
  const rating: LessonRating = {
    id: existing?.id ?? makeId('rating'),
    lessonId,
    teacherId: lesson.ownerId,
    studentId: user.id,
    stars,
    comment: safe.text,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  await write('lessonRatings', [rating, ...ratings.filter((item) => item.id !== rating.id)])
  if (safe.masked) await createSystemReport('review', rating.id, 'Coordonnées détectées et masquées automatiquement.')
  return { ok: true, data: rating }
}

export async function getLessonRatings(lessonId: string): Promise<Array<LessonRating & { studentName: string }>> {
  const user = await getCurrentUser()
  const lesson = (await allLessons()).find((item) => item.id === lessonId)
  if (!lesson || (user?.role === 'teacher' && user.id !== lesson.ownerId)
    || (user?.role !== 'teacher' && user?.role !== 'admin' && user?.role !== 'student')) return []
  const users = await read('users')
  return (await read('lessonRatings')).filter((rating) => rating.lessonId === lessonId && !rating.hidden)
    .map((rating) => ({
      ...rating,
      studentName: safeStudentName(users.find((item) => item.id === rating.studentId)?.name ?? 'Élève'),
    }))
}

async function withinInteractionLimit(userId: string): Promise<boolean> {
  const settings = await read('relationshipSettings')
  const limit = settings.messagesPerHour || MAX_STUDENT_MESSAGES_PER_HOUR
  const since = Date.now() - 60 * 60 * 1000
  const questions = await read('lessonQuestions')
  const messages = await read('privateMessages')
  const questionCount = questions.reduce((count, question) =>
    count + Number(question.authorId === userId && Date.parse(question.createdAt) >= since)
      + question.answers.filter((answer) => answer.authorId === userId && Date.parse(answer.createdAt) >= since).length, 0)
  const messageCount = messages.filter((message) => message.senderId === userId && Date.parse(message.createdAt) >= since).length
  return questionCount + messageCount < limit
}

async function createSystemReport(targetType: Report['targetType'], targetId: string, reason: string): Promise<void> {
  const reports = await read('reports')
  if (reports.some((report) => report.reporterId === 'system' && report.targetId === targetId && report.status === 'pending')) return
  const report: Report = {
    id: makeId('report'), reporterId: 'system', targetType, targetId, reason, createdAt: timestamp(), status: 'pending',
  }
  await write('reports', [report, ...reports])
}

function safeStudentName(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0] ?? 'Élève'
}

async function questionForUser(question: LessonQuestion): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user || question.hidden) return false
  if (user.role === 'admin') return true
  const lesson = (await allLessons()).find((item) => item.id === question.lessonId)
  if (!lesson) return false
  if (user.role === 'teacher') return lesson.ownerId === user.id
  return user.role === 'student' && Boolean(await getLesson(question.lessonId))
}

export async function getLessonQuestions(
  lessonId: string,
  sort: 'recent' | 'popular' | 'unanswered' = 'recent',
): Promise<LessonQuestion[]> {
  const lesson = await getLesson(lessonId)
  if (!lesson) return []
  let questions = (await read('lessonQuestions')).filter((question) => question.lessonId === lessonId && !question.hidden)
  if (sort === 'unanswered') questions = questions.filter((question) => !question.answered)
  questions.sort((a, b) => sort === 'popular'
    ? b.voterIds.length - a.voterIds.length || b.createdAt.localeCompare(a.createdAt)
    : b.createdAt.localeCompare(a.createdAt))
  return questions
}

export async function getTeacherQuestionInbox(lessonId?: string): Promise<Array<{
  question: LessonQuestion
  lessonTitle: string
}>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher') return []
  const ownLessons = (await getTeacherLessonsForId(user.id)).filter((lesson) => !lessonId || lesson.id === lessonId)
  const lessonNames = new Map(ownLessons.map((lesson) => [lesson.id, lesson.title]))
  return (await read('lessonQuestions'))
    .filter((question) => question.teacherId === user.id && !question.answered && !question.hidden
      && lessonNames.has(question.lessonId))
    .map((question) => ({ question, lessonTitle: lessonNames.get(question.lessonId)! }))
    .sort((a, b) => a.question.createdAt.localeCompare(b.question.createdAt))
}

export async function askLessonQuestion(
  lessonId: string,
  text: string,
  videoPositionSeconds?: number,
): Promise<ApiResult<LessonQuestion>> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') return { ok: false, error: 'Réservé aux élèves.' }
  const lesson = await getLesson(lessonId)
  if (!lesson) return { ok: false, error: 'Leçon inaccessible.' }
  if (!text.trim() || text.length > 3000 || videoPositionSeconds !== undefined
    && (!Number.isFinite(videoPositionSeconds) || videoPositionSeconds < 0)) {
    return { ok: false, error: 'La question est invalide.' }
  }
  if (!await withinInteractionLimit(user.id)) return { ok: false, error: 'La limite de messages et questions par heure est atteinte.' }
  const safe = maskContactInfo(text.trim())
  const question: LessonQuestion = {
    id: makeId('question'), lessonId, teacherId: lesson.ownerId, authorId: user.id, text: safe.text,
    ...(videoPositionSeconds === undefined ? {} : { videoPositionSeconds }),
    createdAt: timestamp(), answers: [], voterIds: [], answered: false,
  }
  await write('lessonQuestions', [question, ...await read('lessonQuestions')])
  if (safe.masked) await createSystemReport('question', question.id, 'Coordonnées détectées et masquées automatiquement.')
  return { ok: true, data: question }
}

export async function answerLessonQuestion(questionId: string, text: string): Promise<ApiResult<LessonQuestion>> {
  const user = await getCurrentUser()
  if (!user || user.role === 'admin') return { ok: false, error: 'Connectez-vous avec un compte élève ou enseignant.' }
  const questions = await read('lessonQuestions')
  const question = questions.find((item) => item.id === questionId && !item.hidden)
  if (!question || !await questionForUser(question)) return { ok: false, error: 'Question inaccessible.' }
  const teacherAnswer = user.role === 'teacher'
  if (teacherAnswer && user.id !== question.teacherId) return { ok: false, error: 'Seul l’enseignant de cette leçon peut répondre en tant qu’enseignant.' }
  if (!text.trim() || text.length > 3000) return { ok: false, error: 'La réponse est invalide.' }
  if (user.role === 'student' && !await withinInteractionLimit(user.id)) return { ok: false, error: 'La limite de messages et questions par heure est atteinte.' }
  const safe = maskContactInfo(text.trim())
  const answer: LessonAnswer = {
    id: makeId('answer'), authorId: user.id, text: safe.text, createdAt: timestamp(), teacherAnswer,
  }
  const updated = { ...question, answers: [...question.answers, answer] }
  await write('lessonQuestions', questions.map((item) => item.id === questionId ? updated : item))
  if (safe.masked) await createSystemReport('answer', answer.id, 'Coordonnées détectées et masquées automatiquement.')
  if (teacherAnswer) await notifyUser(question.authorId, 'question-reply', 'Réponse à votre question', 'Votre enseignant a répondu à votre question.', `/lessons/${question.lessonId}`)
  return { ok: true, data: updated }
}

export async function upvoteLessonQuestion(questionId: string): Promise<ApiResult<LessonQuestion>> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') return { ok: false, error: 'Réservé aux élèves.' }
  const questions = await read('lessonQuestions')
  const question = questions.find((item) => item.id === questionId && !item.hidden)
  if (!question || !await questionForUser(question)) return { ok: false, error: 'Question inaccessible.' }
  const updated = question.voterIds.includes(user.id)
    ? question : { ...question, voterIds: [...question.voterIds, user.id] }
  await write('lessonQuestions', questions.map((item) => item.id === questionId ? updated : item))
  return { ok: true, data: updated }
}

export async function markLessonQuestionAnswered(questionId: string): Promise<ApiResult<LessonQuestion>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Réservé à l’enseignant.' }
  const questions = await read('lessonQuestions')
  const question = questions.find((item) => item.id === questionId)
  if (!question || user.role === 'teacher' && question.teacherId !== user.id) return { ok: false, error: 'Question inaccessible.' }
  const updated = { ...question, answered: true }
  await write('lessonQuestions', questions.map((item) => item.id === questionId ? updated : item))
  return { ok: true, data: updated }
}

export async function pinLessonQuestionAnswer(questionId: string, answerId: string): Promise<ApiResult<LessonQuestion>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Réservé à l’enseignant.' }
  const questions = await read('lessonQuestions')
  const question = questions.find((item) => item.id === questionId)
  if (!question || user.role === 'teacher' && question.teacherId !== user.id
    || !question.answers.some((answer) => answer.id === answerId && !answer.hidden)) {
    return { ok: false, error: 'La réponse à épingler est inaccessible.' }
  }
  const updated = { ...question, pinnedAnswerId: answerId }
  await write('lessonQuestions', questions.map((item) => item.id === questionId ? updated : item))
  return { ok: true, data: updated }
}

function studentActivityKey(activity: StudentActivity): string {
  return `${activity.studentId}:${activity.teacherId}:${activity.lessonId}:${activity.type}`
}

async function recordStudentActivity(
  studentId: string,
  lesson: Lesson,
  type: StudentActivity['type'],
): Promise<void> {
  const rows = await read('studentActivity')
  const activity: StudentActivity = {
    studentId, teacherId: lesson.ownerId, lessonId: lesson.id, type, occurredAt: timestamp(),
  }
  const key = studentActivityKey(activity)
  await write('studentActivity', [activity, ...rows.filter((item) => studentActivityKey(item) !== key)])
  await refreshTeacherEngagement(lesson.ownerId)
}

async function refreshTeacherEngagement(teacherId: string, videoMinutes = 0, lessonsCompleted = 0): Promise<void> {
  const month = timestamp().slice(0, 7)
  const activity = (await read('studentActivity')).filter((item) =>
    item.teacherId === teacherId && item.occurredAt.startsWith(month))
  const rows = await read('teacherEngagement')
  const previous = rows.find((item) => item.teacherId === teacherId && item.month === month)
  const updated: TeacherEngagement = {
    teacherId,
    month,
    videoMinutesWatched: (previous?.videoMinutesWatched ?? 0) + videoMinutes,
    lessonsCompleted: (previous?.lessonsCompleted ?? 0) + lessonsCompleted,
    activeStudents: new Set(activity.map((item) => item.studentId)).size,
    revenueSharePercentage: previous?.revenueSharePercentage ?? 0,
  }
  await write('teacherEngagement', [updated, ...rows.filter((item) =>
    item.teacherId !== teacherId || item.month !== month)])
}

function fileIsValid(file: HomeworkFile, image: boolean): boolean {
  if (image && !file.type.startsWith('image/')) return false
  if (!image && file.type !== 'application/pdf') return false
  const match = file.data.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/)
  if (!match || match[1] !== file.type) return false
  const size = Math.floor(match[2].length * 3 / 4) - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0)
  return size <= 3 * 1024 * 1024 && validFileSignature(match[2], file.type)
}

export async function saveHomeworkAssignment(
  input: Omit<HomeworkAssignment, 'id' | 'teacherId' | 'createdAt'>,
): Promise<ApiResult<HomeworkAssignment>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Réservé aux enseignants.' }
  const group = input.groupId && (await read('classGroups')).find((item) => item.id === input.groupId)
  if (input.groupId && (!group || user.role === 'teacher' && group.teacherId !== user.id)) {
    return { ok: false, error: 'Classe inaccessible.' }
  }
  const lessons = input.lessonId ? (await allLessons()).filter((lesson) => lesson.id === input.lessonId) : []
  const modules = (await read('subjects')).flatMap((subject) => subject.chapters)
    .filter((module) => module.id === input.moduleId)
  const ownerId = user.role === 'teacher' ? user.id : lessons[0]?.ownerId ?? modules[0]?.ownerId
  if (user.role === 'teacher' && (lessons.some((lesson) => lesson.ownerId !== user.id)
    || modules.some((module) => module.ownerId !== user.id))) {
    return { ok: false, error: 'Vous ne pouvez ajouter un devoir qu’à votre propre contenu.' }
  }
  if (group && (input.lessonId || input.moduleId)) {
    const linkedContent = (await read('groupContentLinks')).filter((item) => item.groupId === group.id)
    if (input.lessonId && !linkedContent.some((item) => item.lessonIds.includes(input.lessonId!))
      || input.moduleId && !linkedContent.some((item) => item.moduleId === input.moduleId)) {
      return { ok: false, error: 'Le devoir doit être lié à un contenu de cette classe.' }
    }
  }
  if ((!input.lessonId && !input.moduleId) || input.lessonId && lessons.length === 0
    || input.moduleId && modules.length === 0 || !input.title.trim() || !input.instructions.trim()
    || !Number.isFinite(Date.parse(input.dueAt)) || !Number.isFinite(input.maxPoints) || input.maxPoints <= 0
    || input.allowedTypes.length === 0 || !ownerId) {
    return { ok: false, error: 'Les informations du devoir sont invalides.' }
  }
  const assignment: HomeworkAssignment = {
    ...input, title: input.title.trim(), instructions: input.instructions.trim(),
    teacherId: ownerId, id: makeId('homework'), createdAt: timestamp(),
  }
  await write('homeworkAssignments', [assignment, ...await read('homeworkAssignments')])
  if (group) await notifyGroupStudents(group.id, 'announcement', 'Nouveau devoir',
    `Un devoir a été ajouté dans « ${group.name} ».`, '/student/homework')
  return { ok: true, data: assignment }
}

export async function getTeacherHomeworkQueue(): Promise<Array<{
  assignment: HomeworkAssignment
  submission: HomeworkSubmission
  studentName: string
}>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return []
  const [assignments, submissions, users] = await Promise.all([
    read('homeworkAssignments'), read('homeworkSubmissions'), read('users'),
  ])
  return submissions.filter((submission) => submission.grade === undefined)
    .flatMap((submission) => {
      const assignment = assignments.find((item) => item.id === submission.assignmentId)
      return assignment && (user.role === 'admin' || assignment.teacherId === user.id)
        ? [{
          assignment, submission,
          studentName: safeStudentName(users.find((item) => item.id === submission.studentId)?.name ?? 'Élève'),
        }] : []
    })
}

export async function getMyHomework(): Promise<Array<{
  assignment: HomeworkAssignment
  submission?: HomeworkSubmission
  status: 'à faire' | 'rendu' | 'corrigé' | 'en retard'
}>> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') return []
  const [assignments, submissions, completed, catalog, enrollments] = await Promise.all([
    read('homeworkAssignments'), read('homeworkSubmissions'), read(`completed:${user.id}`),
    read('subjects'), read('subjectEnrollments'),
  ])
  const enrolledSubjectIds = new Set(enrollments.filter((item) => item.studentId === user.id).map((item) => item.subjectId))
  const enrolledModules = new Set(catalog.flatMap((subject) => subject.chapters
    .filter((module) => enrolledSubjectIds.has(subject.id)
      || module.lessons.some((lesson) => completed.includes(lesson.id)))
    .map((module) => module.id)))
  const visibleGroups = await Promise.all(assignments.map(async (assignment) => {
    if (assignment.groupId) {
      return await hasGroupContentAccess(user.id, assignment.groupId) ? [assignment] : []
    }
    if (assignment.lessonId) {
      const lesson = (await allLessons()).find((item) => item.id === assignment.lessonId)
      return completed.includes(assignment.lessonId) || Boolean(lesson?.subjectId && enrolledSubjectIds.has(lesson.subjectId))
        || await awaitLessonVisible(assignment.lessonId, user.id)
        ? [assignment] : []
    }
    return assignment.moduleId && enrolledModules.has(assignment.moduleId) ? [assignment] : []
  }))
  const visible = visibleGroups.flat()
  return visible.map((assignment) => {
    const submission = submissions.find((item) => item.assignmentId === assignment.id && item.studentId === user.id)
    const status = submission?.grade !== undefined ? 'corrigé'
      : submission ? submission.late ? 'en retard' : 'rendu'
        : Date.parse(assignment.dueAt) < Date.now() ? 'en retard' : 'à faire'
    return { assignment, submission, status }
  })
}

async function awaitLessonVisible(lessonId: string, studentId: string): Promise<boolean> {
  const current = await getCurrentUser()
  if (!current || current.id !== studentId) return false
  return Boolean(await getLesson(lessonId))
}

export async function submitHomework(
  assignmentId: string,
  submission: { text?: string; file?: HomeworkFile },
): Promise<ApiResult<HomeworkSubmission>> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') return { ok: false, error: 'Réservé aux élèves.' }
  const assignments = await read('homeworkAssignments')
  const assignment = assignments.find((item) => item.id === assignmentId)
  if (!assignment) return { ok: false, error: 'Devoir introuvable.' }
  if (assignment.groupId && !await hasGroupContentAccess(user.id, assignment.groupId)) {
    return { ok: false, error: 'Une inscription acceptée à cette classe est nécessaire.' }
  }
  const lesson = assignment.lessonId ? await getLesson(assignment.lessonId) : undefined
  const [catalog, enrollments, completed] = await Promise.all([
    read('subjects'), read('subjectEnrollments'), read(`completed:${user.id}`),
  ])
  const moduleParent = assignment.moduleId && catalog.find((subject) =>
    subject.status === 'published' && subject.chapters.some((module) =>
      module.id === assignment.moduleId && module.status === 'published'))
  const linkedGroupModule = assignment.groupId
    ? (await read('groupContentLinks')).some((item) => item.groupId === assignment.groupId && item.moduleId === assignment.moduleId && item.published)
    : false
  const accessibleModule = Boolean(assignment.groupId
    ? linkedGroupModule && await hasGroupContentAccess(user.id, assignment.groupId)
    : moduleParent && (enrollments.some((item) =>
    item.studentId === user.id && item.subjectId === moduleParent.id)
    || moduleParent.chapters.some((module) => module.id === assignment.moduleId
      && module.lessons.some((item) => completed.includes(item.id)))))
  if (assignment.lessonId && !lesson || assignment.moduleId && !accessibleModule) {
    return { ok: false, error: 'Ce devoir n’est pas accessible.' }
  }
  const typeAllowed = submission.file
    ? submission.file.type === 'application/pdf'
      ? assignment.allowedTypes.includes('pdf') && fileIsValid(submission.file, false)
      : assignment.allowedTypes.includes('image') && fileIsValid(submission.file, true)
    : assignment.allowedTypes.includes('text') && Boolean(submission.text?.trim())
  if (!typeAllowed || submission.text && submission.text.length > 20000) {
    return { ok: false, error: 'Le format ou le contenu du devoir est invalide.' }
  }
  const rows = await read('homeworkSubmissions')
  const existing = rows.find((item) => item.assignmentId === assignmentId && item.studentId === user.id)
  if (existing?.grade !== undefined) return { ok: false, error: 'Ce devoir a déjà été corrigé.' }
  const submittedAt = timestamp()
  const safe = submission.text ? maskContactInfo(submission.text) : { text: undefined, masked: false }
  const saved: HomeworkSubmission = {
    id: existing?.id ?? makeId('submission'), assignmentId, studentId: user.id,
    ...(safe.text ? { text: safe.text } : {}), ...(submission.file ? { file: submission.file } : {}),
    submittedAt, late: Date.parse(assignment.dueAt) < Date.parse(submittedAt),
  }
  await write('homeworkSubmissions', [saved, ...rows.filter((item) => item.id !== saved.id)])
  if (safe.masked) await createSystemReport('comment', saved.id, 'Coordonnées détectées et masquées automatiquement.')
  return { ok: true, data: saved }
}

export async function gradeHomework(
  submissionId: string,
  grade: number,
  feedback: string,
  correctedFile?: HomeworkFile,
): Promise<ApiResult<HomeworkSubmission>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Réservé aux enseignants.' }
  const rows = await read('homeworkSubmissions')
  const submission = rows.find((item) => item.id === submissionId)
  const assignment = submission && (await read('homeworkAssignments')).find((item) => item.id === submission.assignmentId)
  if (!submission || !assignment || user.role === 'teacher' && assignment.teacherId !== user.id) {
    return { ok: false, error: 'Copie introuvable ou inaccessible.' }
  }
  if (!Number.isFinite(grade) || grade < 0 || grade > assignment.maxPoints || feedback.trim().length > 5000
    || correctedFile && !fileIsValid(correctedFile, correctedFile.type !== 'application/pdf')) {
    return { ok: false, error: 'La correction est invalide.' }
  }
  const safe = maskContactInfo(feedback)
  const updated: HomeworkSubmission = {
    ...submission, grade, feedback: safe.text, ...(correctedFile ? { correctedFile } : {}), correctedAt: timestamp(),
  }
  await write('homeworkSubmissions', rows.map((item) => item.id === submissionId ? updated : item))
  await notifyUser(submission.studentId, 'homework-graded', 'Devoir corrigé', `Votre devoir « ${assignment.title} » a été corrigé.`, '/student/homework')
  if (safe.masked) await createSystemReport('comment', submissionId, 'Coordonnées détectées et masquées automatiquement.')
  return { ok: true, data: updated }
}

type TeacherStudentSummary = {
  id: string
  name: string
  avatarUrl: string
  section: Section
  progressPercent: number
  lastActivityAt: string | null
  averageQuizScore: number | null
}

async function teacherStudentRecords(teacherId: string): Promise<TeacherStudentSummary[]> {
  const [users, followRows, lessons, activity, homeworkAssignments, homeworkSubmissions, enrollments] = await Promise.all([
    read('users'), read('teacherFollows'), getTeacherLessonsForId(teacherId),
    read('studentActivity'), read('homeworkAssignments'), read('homeworkSubmissions'), read('subjectEnrollments'),
  ])
  const ownLessons = lessons.filter((lesson) => lesson.status === 'published')
  const lessonIds = new Set(ownLessons.map((lesson) => lesson.id))
  const ownSubjectIds = new Set(ownLessons.flatMap((lesson) => lesson.subjectId ? [lesson.subjectId] : []))
  const teacherHomeworkIds = new Set(homeworkAssignments.filter((assignment) =>
    assignment.teacherId === teacherId).map((assignment) => assignment.id))
  const output: TeacherStudentSummary[] = []
  for (const student of users.filter((item) => item.role === 'student' && !item.blocked)) {
    const [completed, results] = await Promise.all([
      read(`completed:${student.id}`), read(`quizResults:${student.id}`),
    ])
    const teacherResults = results.filter((result) => lessonIds.has(result.lessonId))
    const teacherCompleted = completed.filter((id) => lessonIds.has(id))
    const enrolled = teacherResults.length > 0 || teacherCompleted.length > 0
      || enrollments.some((enrollment) => enrollment.studentId === student.id && ownSubjectIds.has(enrollment.subjectId))
      || homeworkSubmissions.some((submission) =>
        submission.studentId === student.id && teacherHomeworkIds.has(submission.assignmentId))
    const isFollowing = followsRowsHas(followRows, teacherId, student.id)
    if (!isFollowing && !enrolled) continue
    const activityRows = activity.filter((item) => item.teacherId === teacherId && item.studentId === student.id)
    const lastActivityAt = [
      ...teacherResults.map((item) => item.date),
      ...activityRows.map((item) => item.occurredAt),
    ].sort().at(-1) ?? null
    output.push({
      id: student.id,
      name: safeStudentName(student.name),
      avatarUrl: student.avatarUrl ?? '',
      section: student.section,
      progressPercent: ownLessons.length ? Math.round(teacherCompleted.length / ownLessons.length * 100) : 0,
      lastActivityAt,
      averageQuizScore: teacherResults.length
        ? Math.round(teacherResults.reduce((sum, item) => sum + item.score, 0) / teacherResults.length)
        : null,
    })
  }
  return output
}

function followsRowsHas(follows: TeacherFollow[], teacherId: string, studentId: string): boolean {
  return follows.some((follow) => follow.teacherId === teacherId && follow.studentId === studentId)
}

export async function getTeacherStudents(query = '', section?: Section | 'all'): Promise<TeacherStudentSummary[]> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher') return []
  const normalized = query.trim().toLocaleLowerCase('fr-FR')
  const students = await teacherStudentRecords(user.id)
  return students.filter((student) => (!section || section === 'all' || student.section === section)
    && (!normalized || student.name.toLocaleLowerCase('fr-FR').includes(normalized)))
}

export async function getTeacherStudentDetail(studentId: string): Promise<{
  student: TeacherStudentSummary
  completedLessons: Array<{ id: string; title: string }>
  quizHistory: QuizResult[]
  homeworkGrades: Array<{ title: string; grade: number; maxPoints: number; feedback: string }>
} | undefined> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher') return undefined
  const student = (await teacherStudentRecords(user.id)).find((item) => item.id === studentId)
  if (!student) return undefined
  const lessons = (await getTeacherLessonsForId(user.id)).filter((lesson) => lesson.status === 'published')
  const lessonIds = new Set(lessons.map((lesson) => lesson.id))
  const [completed, results, assignments, submissions] = await Promise.all([
    read(`completed:${studentId}`), read(`quizResults:${studentId}`), read('homeworkAssignments'), read('homeworkSubmissions'),
  ])
  return {
    student,
    completedLessons: lessons.filter((lesson) => completed.includes(lesson.id)).map(({ id, title }) => ({ id, title })),
    quizHistory: results.filter((result) => lessonIds.has(result.lessonId)),
    homeworkGrades: submissions.filter((submission) => submission.studentId === studentId && submission.grade !== undefined)
      .flatMap((submission) => {
        const assignment = assignments.find((item) => item.id === submission.assignmentId && item.teacherId === user.id)
        return assignment ? [{
          title: assignment.title, grade: submission.grade!, maxPoints: assignment.maxPoints, feedback: submission.feedback ?? '',
        }] : []
      }),
  }
}

export async function getTeacherAlerts(): Promise<{
  strugglingStudents: TeacherStudentSummary[]
  difficultQuestions: Array<{ lessonId: string; lessonTitle: string; question: string; successRate: number }>
}> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher') return { strugglingStudents: [], difficultQuestions: [] }
  const students = await teacherStudentRecords(user.id)
  const inactiveBefore = Date.now() - 7 * 24 * 60 * 60 * 1000
  const strugglingStudents = students.filter((student) => student.averageQuizScore !== null && student.averageQuizScore < 50
    || !student.lastActivityAt || Date.parse(student.lastActivityAt) < inactiveBefore)
  const lessons = (await getTeacherLessonsForId(user.id)).filter((lesson) => lesson.quiz.questions.length > 0)
  const hard: Array<{ lessonId: string; lessonTitle: string; question: string; successRate: number }> = []
  for (const lesson of lessons) {
    const results = (await read('users')).filter((item) => item.role === 'student')
    const attempts = (await Promise.all(results.map((student) => read(`quizResults:${student.id}`))))
      .flat().filter((result) => result.lessonId === lesson.id)
    for (let index = 0; index < lesson.quiz.questions.length; index += 1) {
      if (!attempts.length) continue
      const correct = attempts.filter((attempt) => attempt.answers[index] === lesson.quiz.questions[index].answer).length
      hard.push({
        lessonId: lesson.id, lessonTitle: lesson.title, question: lesson.quiz.questions[index].prompt,
        successRate: Math.round(correct / attempts.length * 100),
      })
    }
  }
  return { strugglingStudents, difficultQuestions: hard.sort((a, b) => a.successRate - b.successRate).slice(0, 10) }
}

async function studentHasSubjectProgress(studentId: string, subjectId: string): Promise<boolean> {
  const lessons = (await allLessons()).filter((lesson) => lesson.subjectId === subjectId)
  const lessonIds = new Set(lessons.map((lesson) => lesson.id))
  const [completed, results, enrollments] = await Promise.all([
    read(`completed:${studentId}`), read(`quizResults:${studentId}`), read('subjectEnrollments'),
  ])
  return enrollments.some((item) => item.studentId === studentId && item.subjectId === subjectId)
    || completed.some((id) => lessonIds.has(id)) || results.some((result) => lessonIds.has(result.lessonId))
}

export async function publishTeacherAnnouncement(input: {
  title: string
  body: string
  audience: TeacherAnnouncement['audience']
  pinned?: boolean
}): Promise<ApiResult<TeacherAnnouncement>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher') return { ok: false, error: 'Réservé aux enseignants.' }
  if (!input.title.trim() || !input.body.trim() || input.title.length > 150 || input.body.length > 5000) {
    return { ok: false, error: 'L’annonce est invalide.' }
  }
  if (input.audience.type === 'subject' && !(await teacherSubjectIds(user.id)).includes(input.audience.subjectId)) {
    return { ok: false, error: 'Vous ne pouvez annoncer que dans vos matières.' }
  }
  const safeTitle = maskContactInfo(input.title)
  const safeBody = maskContactInfo(input.body)
  const announcement: TeacherAnnouncement = {
    id: makeId('announcement'), teacherId: user.id, title: safeTitle.text, body: safeBody.text,
    audience: input.audience, pinned: input.pinned ?? false, createdAt: timestamp(),
  }
  await write('teacherAnnouncements', [announcement, ...await read('teacherAnnouncements')])
  const students = (await read('users')).filter((item) => item.role === 'student' && !item.blocked)
  const eligible: User[] = []
  for (const student of students) {
    const follows = (await read('teacherFollows')).some((follow) =>
      follow.teacherId === user.id && follow.studentId === student.id)
    const matches = input.audience.type === 'followers' ? follows
      : await studentHasSubjectProgress(student.id, input.audience.subjectId)
    if (matches) eligible.push(student)
  }
  const notifications = eligible.map((student) => ({
    id: makeId('notification'), userId: student.id, type: 'announcement' as const,
    title: 'Nouvelle annonce', message: announcement.title, href: '/dashboard', createdAt: timestamp(),
  }))
  await write('notifications', [...notifications, ...await read('notifications')])
  if (safeTitle.masked || safeBody.masked) await createSystemReport('comment', announcement.id, 'Coordonnées détectées et masquées automatiquement.')
  return { ok: true, data: announcement }
}

export async function getTeacherAnnouncements(): Promise<TeacherAnnouncement[]> {
  const user = await getCurrentUser()
  if (!user) return []
  const rows = await read('teacherAnnouncements')
  if (user.role === 'teacher') return rows.filter((item) => item.teacherId === user.id)
  if (user.role === 'admin') return rows
  if (user.role !== 'student') return []
  const follows = await read('teacherFollows')
  const visible: TeacherAnnouncement[] = []
  for (const item of rows) {
    if (item.audience.type === 'followers'
      ? follows.some((follow) => follow.teacherId === item.teacherId && follow.studentId === user.id)
      : await studentHasSubjectProgress(user.id, item.audience.subjectId)) {
      visible.push(item)
    }
  }
  return visible.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt))
}

function messageIsDisabled(settings: RelationshipSettings, userIds: string[]): boolean {
  return !settings.messagingEnabled || userIds.some((id) => settings.disabledMessagingUserIds.includes(id))
}

function containsBannedWord(text: string, settings: RelationshipSettings): boolean {
  const normalized = text.toLocaleLowerCase('fr-FR')
  return settings.bannedWords.some((word) => word.trim() && normalized.includes(word.toLocaleLowerCase('fr-FR')))
}

function conversationIdFor(studentId: string, teacherId: string): string {
  return `conversation:${studentId}:${teacherId}`
}

async function storePrivateMessage(
  conversationId: string,
  senderId: string,
  recipientId: string,
  text: string,
): Promise<PrivateMessage> {
  const settings = await read('relationshipSettings')
  const safe = maskContactInfo(text.trim())
  const flagged = safe.masked || containsBannedWord(text, settings)
  const message: PrivateMessage = {
    id: makeId('message'), conversationId, senderId, recipientId, text: safe.text,
    createdAt: timestamp(), flagged,
  }
  await write('privateMessages', [message, ...await read('privateMessages')])
  if (flagged) await createSystemReport('message', message.id, safe.masked
    ? 'Coordonnées détectées et masquées automatiquement.' : 'Le message contient un terme à modérer.')
  await notifyUser(recipientId, 'message-received', 'Nouveau message', 'Vous avez reçu un message sur la plateforme.', '/messages')
  return message
}

export async function sendTeacherMessage(teacherId: string, text: string): Promise<ApiResult<PrivateMessage>> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') return { ok: false, error: 'Seuls les élèves peuvent démarrer une conversation.' }
  const teacher = (await read('users')).find((item) => item.id === teacherId && item.role === 'teacher' && !item.blocked)
  if (!teacher) return { ok: false, error: 'Enseignant introuvable.' }
  if (!text.trim() || text.length > 3000) return { ok: false, error: 'Le message est invalide.' }
  const settings = await read('relationshipSettings')
  const blocks = await read('messagingBlocks')
  if (messageIsDisabled(settings, [user.id, teacherId])
    || blocks.some((block) => block.studentId === user.id && block.teacherId === teacherId)) {
    return { ok: false, error: 'La messagerie est indisponible pour cette conversation.' }
  }
  if (!await withinInteractionLimit(user.id)) return { ok: false, error: 'La limite de messages et questions par heure est atteinte.' }
  return { ok: true, data: await storePrivateMessage(conversationIdFor(user.id, teacherId), user.id, teacherId, text) }
}

export async function replyToTeacherConversation(
  conversationId: string,
  text: string,
): Promise<ApiResult<PrivateMessage>> {
  const user = await getCurrentUser()
  if (!user || user.role === 'admin') return { ok: false, error: 'Compte élève ou enseignant requis.' }
  const messages = (await read('privateMessages')).filter((item) => item.conversationId === conversationId)
  const first = messages.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
  if (!first) return { ok: false, error: 'La conversation n’existe pas.' }
  const studentId = first.senderId
  const teacherId = first.recipientId
  if (user.role === 'teacher' && user.id !== teacherId || user.role === 'student' && user.id !== studentId) {
    return { ok: false, error: 'Conversation inaccessible.' }
  }
  if (user.role === 'teacher' && first.senderId !== studentId) return { ok: false, error: 'Un enseignant ne peut pas démarrer une conversation.' }
  if (!text.trim() || text.length > 3000) return { ok: false, error: 'Le message est invalide.' }
  const settings = await read('relationshipSettings')
  const blocks = await read('messagingBlocks')
  if (messageIsDisabled(settings, [studentId, teacherId])
    || blocks.some((block) => block.studentId === studentId && block.teacherId === teacherId)) {
    return { ok: false, error: 'La messagerie est indisponible pour cette conversation.' }
  }
  if (user.role === 'student' && !await withinInteractionLimit(user.id)) {
    return { ok: false, error: 'La limite de messages et questions par heure est atteinte.' }
  }
  const recipientId = user.role === 'teacher' ? studentId : teacherId
  return {
    ok: true,
    data: await storePrivateMessage(conversationId, user.id, recipientId, text),
  }
}

export async function getMyConversations(): Promise<Array<{
  id: string
  participantId: string
  participantName: string
  lastMessage: PrivateMessage
  unreadCount: number
}>> {
  const user = await getCurrentUser()
  if (!user || user.role === 'admin') return []
  const [messages, users] = await Promise.all([read('privateMessages'), read('users')])
  const conversations = [...new Set(messages.filter((item) =>
    item.senderId === user.id || item.recipientId === user.id).map((item) => item.conversationId))]
  return conversations.flatMap((id) => {
    const rows = messages.filter((item) => item.conversationId === id && !item.hidden)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const lastMessage = rows.at(-1)
    if (!lastMessage) return []
    const participantId = lastMessage.senderId === user.id ? lastMessage.recipientId : lastMessage.senderId
    const participant = users.find((item) => item.id === participantId)
    if (!participant) return []
    return [{
      id,
      participantId,
      participantName: participant.role === 'student' ? safeStudentName(participant.name) : participant.name,
      lastMessage,
      unreadCount: rows.filter((item) => item.recipientId === user.id && !item.readAt).length,
    }]
  }).sort((a, b) => b.lastMessage.createdAt.localeCompare(a.lastMessage.createdAt))
}

export async function getConversationMessages(conversationId: string): Promise<PrivateMessage[]> {
  const user = await getCurrentUser()
  if (!user || user.role === 'admin') return []
  const rows = (await read('privateMessages')).filter((item) => item.conversationId === conversationId && !item.hidden)
  return rows.some((item) => item.senderId === user.id || item.recipientId === user.id)
    ? rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : []
}

export async function markPrivateMessageRead(messageId: string): Promise<ApiResult<PrivateMessage>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Connectez-vous pour continuer.' }
  const rows = await read('privateMessages')
  const message = rows.find((item) => item.id === messageId && item.recipientId === user.id)
  if (!message) return { ok: false, error: 'Message introuvable.' }
  const updated = { ...message, readAt: timestamp() }
  await write('privateMessages', rows.map((item) => item.id === messageId ? updated : item))
  return { ok: true, data: updated }
}

export async function blockTeacherMessaging(teacherId: string, blocked = true): Promise<ApiResult<void>> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') return { ok: false, error: 'Réservé aux élèves.' }
  if (!(await read('users')).some((item) => item.id === teacherId && item.role === 'teacher')) {
    return { ok: false, error: 'Enseignant introuvable.' }
  }
  const blocks = await read('messagingBlocks')
  const exists = blocks.some((item) => item.studentId === user.id && item.teacherId === teacherId)
  const next = blocked
    ? exists ? blocks : [...blocks, { studentId: user.id, teacherId, createdAt: timestamp() }]
    : blocks.filter((item) => item.studentId !== user.id || item.teacherId !== teacherId)
  await write('messagingBlocks', next)
  return { ok: true, data: undefined }
}

export async function isTeacherMessagingBlocked(teacherId: string): Promise<boolean> {
  const user = await getCurrentUser()
  return user?.role === 'student' && (await read('messagingBlocks')).some((item) =>
    item.studentId === user.id && item.teacherId === teacherId)
}

export async function isConversationMessagingBlocked(conversationId: string): Promise<boolean> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') return false
  const first = (await read('privateMessages')).find((item) => item.conversationId === conversationId)
  return Boolean(first && (await read('messagingBlocks')).some((item) =>
    item.studentId === user.id && item.teacherId === first.recipientId))
}

export async function createReport(
  targetType: Report['targetType'],
  targetId: string,
  reason: string,
): Promise<ApiResult<Report>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Connectez-vous pour signaler ce contenu.' }
  if (!reason.trim() || reason.length > 1000) return { ok: false, error: 'Précisez le motif du signalement.' }
  const exists = targetType === 'message'
    ? (await read('privateMessages')).some((item) => item.id === targetId
      && (item.senderId === user.id || item.recipientId === user.id || user.role === 'admin'))
    : targetType === 'announcement'
      ? await (async () => {
        const announcement = (await read('groupAnnouncements')).find((item) => item.id === targetId)
        const group = announcement && (await read('classGroups')).find((item) => item.id === announcement.groupId)
        return Boolean(announcement && group && (user.role === 'admin'
          || user.role === 'teacher' && group.teacherId === user.id
          || user.role === 'student' && await hasGroupContentAccess(user.id, group.id)))
      })()
    : targetType === 'question'
      ? (await read('lessonQuestions')).some((item) => item.id === targetId)
      : targetType === 'answer'
        ? (await read('lessonQuestions')).some((item) => item.answers.some((answer) => answer.id === targetId))
        : targetType === 'review'
          ? (await read('lessonRatings')).some((item) => item.id === targetId)
          : (await read('lessonRatings')).some((item) => item.id === targetId)
  if (!exists) return { ok: false, error: 'Le contenu à signaler est introuvable.' }
  const reports = await read('reports')
  if (reports.some((item) => item.reporterId === user.id && item.targetId === targetId && item.status === 'pending')) {
    return { ok: false, error: 'Vous avez déjà signalé ce contenu.' }
  }
  const report: Report = {
    id: makeId('report'), reporterId: user.id, targetType, targetId,
    reason: reason.trim(), createdAt: timestamp(), status: 'pending',
  }
  await write('reports', [report, ...reports])
  return { ok: true, data: report }
}

export async function getReports(): Promise<Report[]> {
  const user = await getCurrentUser()
  return user?.role === 'admin' ? read('reports') : []
}

async function targetAuthor(report: Report): Promise<string | undefined> {
  if (report.targetType === 'message') return (await read('privateMessages')).find((item) => item.id === report.targetId)?.senderId
  if (report.targetType === 'announcement') return (await read('groupAnnouncements')).find((item) => item.id === report.targetId)?.teacherId
  if (report.targetType === 'question') return (await read('lessonQuestions')).find((item) => item.id === report.targetId)?.authorId
  if (report.targetType === 'answer') return (await read('lessonQuestions'))
    .flatMap((item) => item.answers).find((answer) => answer.id === report.targetId)?.authorId
  return (await read('lessonRatings')).find((item) => item.id === report.targetId)?.studentId
}

export async function moderateReport(
  reportId: string,
  action: ModerationAction['action'],
  note = '',
): Promise<ApiResult<ModerationAction>> {
  const admin = await getCurrentUser()
  if (admin?.role !== 'admin') return { ok: false, error: 'Réservé à l’administration.' }
  const reports = await read('reports')
  const report = reports.find((item) => item.id === reportId && item.status === 'pending')
  if (!report) return { ok: false, error: 'Signalement introuvable ou déjà traité.' }
  const authorId = await targetAuthor(report)
  if (action === 'hide') {
    if (report.targetType === 'message') {
      await write('privateMessages', (await read('privateMessages')).map((item) =>
        item.id === report.targetId ? { ...item, hidden: true } : item))
    } else if (report.targetType === 'announcement') {
      await write('groupAnnouncements', (await read('groupAnnouncements')).map((item) =>
        item.id === report.targetId ? { ...item, hidden: true } : item))
    } else if (report.targetType === 'question') {
      await write('lessonQuestions', (await read('lessonQuestions')).map((item) =>
        item.id === report.targetId ? { ...item, hidden: true } : item))
    } else if (report.targetType === 'answer') {
      await write('lessonQuestions', (await read('lessonQuestions')).map((item) => ({
        ...item, answers: item.answers.map((answer) => answer.id === report.targetId ? { ...answer, hidden: true } : answer),
      })))
    } else {
      await write('lessonRatings', (await read('lessonRatings')).map((item) =>
        item.id === report.targetId ? { ...item, hidden: true } : item))
    }
  } else if (action === 'delete') {
    if (report.targetType === 'message') await write('privateMessages', (await read('privateMessages')).filter((item) => item.id !== report.targetId))
    else if (report.targetType === 'announcement') await write('groupAnnouncements', (await read('groupAnnouncements')).filter((item) => item.id !== report.targetId))
    else if (report.targetType === 'question') await write('lessonQuestions', (await read('lessonQuestions')).filter((item) => item.id !== report.targetId))
    else if (report.targetType === 'answer') await write('lessonQuestions', (await read('lessonQuestions')).map((item) => ({
      ...item, answers: item.answers.filter((answer) => answer.id !== report.targetId),
    })))
    else await write('lessonRatings', (await read('lessonRatings')).filter((item) => item.id !== report.targetId))
  } else if (action === 'warn' && authorId) {
    await notifyUser(authorId, 'message-received', 'Avertissement de modération', note.trim() || 'Un contenu publié a été signalé.', '/dashboard')
  } else if (action === 'block-messaging' && authorId) {
    const settings = await read('relationshipSettings')
    await write('relationshipSettings', {
      ...settings, disabledMessagingUserIds: [...new Set([...settings.disabledMessagingUserIds, authorId])],
    })
  } else if (action === 'suspend' && authorId) {
    const result = await blockUser(authorId, true)
    if (!result.ok) return { ok: false, error: result.error }
  }
  const resolved = { ...report, status: 'resolved' as const }
  await write('reports', reports.map((item) => item.id === reportId ? resolved : item))
  const log: ModerationAction = {
    id: makeId('moderation'), reportId, adminId: admin.id, action, note: note.trim(), createdAt: timestamp(),
  }
  await write('moderationActions', [log, ...await read('moderationActions')])
  return { ok: true, data: log }
}

export async function getModerationActions(): Promise<ModerationAction[]> {
  const user = await getCurrentUser()
  return user?.role === 'admin' ? read('moderationActions') : []
}

export async function getRelationshipSettings(): Promise<RelationshipSettings | undefined> {
  const user = await getCurrentUser()
  return user?.role === 'admin' ? read('relationshipSettings') : undefined
}

export async function saveRelationshipSettings(
  settings: RelationshipSettings,
): Promise<ApiResult<RelationshipSettings>> {
  const user = await getCurrentUser()
  if (user?.role !== 'admin') return { ok: false, error: 'Réservé à l’administration.' }
  if (!Number.isInteger(settings.messagesPerHour) || settings.messagesPerHour < 1 || settings.messagesPerHour > 1000
    || settings.bannedWords.some((word) => !word.trim())) return { ok: false, error: 'Paramètres de modération invalides.' }
  await write('relationshipSettings', {
    ...settings,
    bannedWords: [...new Set(settings.bannedWords.map((word) => word.trim()))],
    disabledMessagingUserIds: [...new Set(settings.disabledMessagingUserIds)],
  })
  return { ok: true, data: settings }
}

export async function markAllNotificationsRead(): Promise<ApiResult<void>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Connectez-vous pour continuer.' }
  const now = timestamp()
  await write('notifications', (await read('notifications')).map((item) =>
    item.userId === user.id && !item.readAt ? { ...item, readAt: now } : item))
  return { ok: true, data: undefined }
}

export async function getAdminEngagementReport(): Promise<TeacherEngagement[]> {
  const user = await getCurrentUser()
  return user?.role === 'admin' ? read('teacherEngagement') : []
}

export async function setTeacherRevenueShare(
  teacherId: string,
  percentage: number,
): Promise<ApiResult<TeacherEngagement[]>> {
  const user = await getCurrentUser()
  if (user?.role !== 'admin') return { ok: false, error: 'Réservé à l’administration.' }
  if (!(await read('users')).some((item) => item.id === teacherId && item.role === 'teacher')
    || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    return { ok: false, error: 'Pourcentage ou enseignant invalide.' }
  }
  const rows = await read('teacherEngagement')
  const teacherRows = rows.filter((item) => item.teacherId === teacherId)
  const next = teacherRows.length
    ? rows.map((item) => item.teacherId === teacherId ? { ...item, revenueSharePercentage: percentage } : item)
    : [...rows, {
      teacherId, month: timestamp().slice(0, 7), videoMinutesWatched: 0, lessonsCompleted: 0,
      activeStudents: 0, revenueSharePercentage: percentage,
    }]
  await write('teacherEngagement', next)
  return { ok: true, data: next.filter((item) => item.teacherId === teacherId) }
}

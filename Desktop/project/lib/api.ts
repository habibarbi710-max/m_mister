import { subjects, demoUsers } from './mock-data'
import type { ApiResult, AuthCredential, Exam, Lesson, LessonInput, LiveSession, Payment, PlatformSettings, QuizResult, ReorderLessonInput, Subscription, TeacherAssignment, User } from '@/types'

export type LanguagePreference = 'fr'

export async function getAuthCredentials(): Promise<AuthCredential[]> { return read('accounts', []) }
export async function saveAuthCredentials(accounts: AuthCredential[]): Promise<void> { write('accounts', accounts) }
export async function saveLanguagePreference(language: LanguagePreference): Promise<void> { write('lang', language) }

const seedNames: Record<string, string> = {
  'student-1': 'Amna Ayari',
  'teacher-1': 'Meriem Ben Salah',
  'admin-1': 'Administration',
}

function normalizeSeedUser(user: User): User {
  const name = seedNames[user.id]
  return name ? { ...user, name } : user
}

const read = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback
  const value = localStorage.getItem(`edubac:${key}`)
  return value ? JSON.parse(value) as T : fallback
}

const write = (key: string, value: unknown): void => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`edubac:${key}`, JSON.stringify(value))
    } catch (error) {
      throw new Error(`Unable to persist ${key}`, { cause: error })
    }
  }
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

const staticLessons = (): Lesson[] => subjects.flatMap((subject) => subject.chapters).flatMap((chapter) => chapter.lessons)
const allLessons = (): Lesson[] => {
  const saved = read<Lesson[]>('lessons', [])
  const deleted = new Set(read<string[]>('deletedLessons', []))
  const lessons = new Map(staticLessons().filter((lesson) => !deleted.has(lesson.id)).map((lesson) => [lesson.id, lesson]))
  for (const lesson of saved) {
    if (!deleted.has(lesson.id)) lessons.set(lesson.id, lesson)
  }
  return [...lessons.values()]
}

export async function getSubjects(): Promise<typeof subjects> {
  const lessonMap = new Map(allLessons().map((lesson) => [lesson.id, lesson]))
  const user = await getCurrentUser()
  const active = user?.role === 'admin' || (user?.role === 'student' && (await getSubscription()).status === 'Active')
  const canRead = (lesson: Lesson) => active || user?.role === 'teacher' && user.id === lesson.teacherId || lesson.isFree
  return subjects.map((subject) => ({
    ...subject,
    chapters: subject.chapters.map((chapter) => ({
      ...chapter,
      lessons: [
        ...chapter.lessons.flatMap((lesson) => {
          const current = lessonMap.get(lesson.id)
          return current?.status === 'published' && current.subjectId === subject.id && current.chapterId === chapter.id ? [current] : []
        }),
        ...allLessons().filter((lesson) => lesson.subjectId === subject.id && lesson.chapterId === chapter.id && !chapter.lessons.some((item) => item.id === lesson.id)),
      ].filter((lesson) => lesson.status === 'published').sort((a, b) => a.order - b.order)
        .map((lesson) => canRead(lesson) ? lesson : {
          ...lesson, videoUrl: '', summary: '', pdfUrl: '', exercises: [], quiz: { ...lesson.quiz, questions: [] },
        }),
    })),
  }))
}
export async function getSubject(id: string): Promise<(typeof subjects)[number] | undefined> { return (await getSubjects()).find((subject) => subject.id === id) }
export async function getLesson(id: string): Promise<Lesson | undefined> {
  const lesson = allLessons().find((item) => item.id === id)
  if (!lesson) return undefined
  const user = await getCurrentUser()
  const educator = user?.role === 'teacher' || user?.role === 'admin'
  if (user?.role === 'teacher' && lesson.teacherId !== user.id) return undefined
  if (lesson.status !== 'published' && !educator) return undefined
  if (!lesson.isFree && !educator) {
    const subscription = await getSubscription()
    if (subscription.status !== 'Active') return undefined
  }
  return lesson
}
export async function getExams(): Promise<Exam[]> {
  const rows = read<Exam[]>('exams', [])
  const user = await getCurrentUser()
  if (user?.role === 'admin') return rows
  if (user?.role === 'teacher') return rows.map((exam) => ({ ...exam, teacherId: exam.teacherId ?? (exam.subjectId === 'math' ? 'teacher-1' : 'teacher-2') })).filter((exam) => exam.teacherId === user.id)
  if ((await getSubscription()).status === 'Active') return rows
  return rows.map((exam) => ({ ...exam, correction: '' }))
}
export async function getLiveSessions(): Promise<LiveSession[]> {
  const user = await getCurrentUser()
  const sessions = read<LiveSession[]>('liveSessions', []).filter((session) => !session.cancelled)
  const active = user?.role === 'admin' || (user?.role === 'student' && (await getSubscription()).status === 'Active')
  return sessions.map((session) => active || user?.role === 'teacher' && user.id === session.teacherId
    ? session
    : { ...session, meetingUrl: '', replay: undefined })
}
export async function getCurrentUser(): Promise<User | null> {
  const session = read<User | null>('user', null)
  if (!session) return null
  const account = read<User[]>('users', demoUsers).find((user) => user.id === session.id)
  if (account?.blocked) return null
  return normalizeSeedUser(account ?? session)
}
export async function signIn(identifier: string): Promise<User> {
  const normalized = identifier.trim().toLowerCase()
  const matches = (item: User) => item.email.toLowerCase() === normalized || item.phone.replace(/\s/g, '').toLowerCase() === normalized.replace(/\s/g, '')
  const match = read<User[]>('users', demoUsers).find(matches)
    ?? demoUsers.find(matches)
  if (!match) throw new Error('Account not found')
  if (match.blocked) throw new Error('This account is blocked')
  const user = normalizeSeedUser(match)
  write('user', user)
  return user
}
export async function registerUser(user: User): Promise<User> {
  if (user.role !== 'student' || !user.name.trim() || (!user.email.trim() && !user.phone.trim())) throw new Error('Invalid student account')
  const users = read<User[]>('users', demoUsers)
  if (users.some((item) => (user.email && item.email.toLowerCase() === user.email.toLowerCase())
    || (user.phone && item.phone.replace(/\s/g, '') === user.phone.replace(/\s/g, '')))) throw new Error('Account already exists')
  write('users', [...users.filter((item) => item.id !== user.id), user])
  write('user', user)
  return user
}
export async function signOut(): Promise<void> { write('user', null) }
export async function updateProfile(user: User): Promise<User> {
  const current = await getCurrentUser()
  if (!current || current.id !== user.id) throw new Error('You can only update your own profile')
  if (user.role !== current.role || user.name.trim().length < 2 || !/^\+?[\d\s()-]{8,}$/.test(user.phone.trim())) throw new Error('Invalid profile')
  const users = read<User[]>('users', demoUsers)
  write('users', users.map((item) => item.id === user.id ? user : item))
  const credentials = await getAuthCredentials()
  await saveAuthCredentials(credentials.map((item) => item.user.id === user.id ? { ...item, user } : item))
  write('user', user)
  return user
}

export async function getCompletedLessons(): Promise<string[]> {
  const user = await getCurrentUser()
  return user?.role === 'student' ? read<string[]>(`completed:${user.id}`, []) : []
}
export async function getLastViewedLesson(): Promise<string | null> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'student') return null
  const id = read<string | null>(`lastViewed:${user.id}`, null)
  return id && await getLesson(id) ? id : null
}
export async function completeLesson(id: string): Promise<string[]> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') throw new Error('Student permission required')
  const lesson = await getLesson(id)
  if (!lesson) throw new Error('Lesson not available')
  const ids = await getCompletedLessons()
  const next = ids.includes(id) ? ids : [...ids, id]
  write(`completed:${user.id}`, next)
  return next
}
export async function getQuizResults(): Promise<QuizResult[]> {
  const user = await getCurrentUser()
  if (user?.role === 'teacher' || user?.role === 'admin') return []
  return read<QuizResult[]>(`quizResults:${user?.id ?? 'anonymous'}`, [])
}
export async function submitQuizResult(title: string, score: number, lessonId = '', answers: number[] = []): Promise<QuizResult[]> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') throw new Error('Student permission required')
  if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error('Quiz score must be between 0 and 100')
  if (lessonId && !await getLesson(lessonId)) throw new Error('Lesson not available')
  const results = await getQuizResults()
  const next = [{ id: `result-${Date.now()}`, lessonId, title, score, date: new Date().toISOString(), answers }, ...results]
  write(`quizResults:${user.id}`, next)
  const metrics = read<Array<{ lessonId: string; score: number }>>('quizMetrics', [])
  if (lessonId) write('quizMetrics', [...metrics, { lessonId, score }])
  return next
}

export async function getLessonPerformance(lessonId: string): Promise<{ attempts: number; averageScore: number | null }> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { attempts: 0, averageScore: null }
  const lessons = await getTeacherLessons()
  if (user.role === 'teacher' && !lessons.some((lesson) => lesson.id === lessonId)) return { attempts: 0, averageScore: null }
  const rows = read<Array<{ lessonId: string; score: number }>>('quizMetrics', []).filter((item) => item.lessonId === lessonId)
  return { attempts: rows.length, averageScore: rows.length ? Math.round(rows.reduce((sum, item) => sum + item.score, 0) / rows.length) : null }
}

export async function createPaymentRequest(plan: string, amount: number, receipt: string, receiptType = 'image/jpeg'): Promise<ApiResult<Payment>> {
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
  write('payments', [payment, ...read<Payment[]>('payments', [])])
  write(`subscription:${user.id}`, { status: 'Pending', plan })
  return { ok: true, data: payment }
}
export async function getPayments(): Promise<Payment[]> {
  const user = await getCurrentUser()
  return user?.role === 'admin' ? read<Payment[]>('payments', []) : []
}
export async function getMyPayments(): Promise<Payment[]> {
  const user = await getCurrentUser()
  return user?.role === 'student' ? read<Payment[]>('payments', []).filter((payment) => payment.userId === user.id) : []
}
export async function approvePayment(id: string, approved: boolean, reason = ''): Promise<ApiResult<Payment[]>> {
  const user = await getCurrentUser()
  if (user?.role !== 'admin') return { ok: false, error: 'Admin permission required' }
  if (!approved && reason.trim().length < 5) return { ok: false, error: 'A rejection reason of at least five characters is required' }
  const rows = await getPayments()
  const target = rows.find((payment) => payment.id === id)
  if (!target || target.status !== 'Pending') return { ok: false, error: 'Pending payment not found' }
  const next = rows.map((payment) => payment.id === id ? {
    ...payment,
    status: approved ? 'Approved' as const : 'Rejected' as const,
    rejectionReason: approved ? undefined : reason,
  } : payment)
  write('payments', next)
  const payment = next.find((item) => item.id === id)
  if (payment) write(`subscription:${payment.userId}`, approved
    ? { status: 'Active', plan: payment.plan, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) }
    : { status: 'None' })
  return { ok: true, data: next }
}
export async function getSubscription(): Promise<Subscription> {
  const user = await getCurrentUser()
  const subscription = read<Subscription>(`subscription:${user?.id ?? 'anonymous'}`, { status: 'None' })
  if (subscription.status === 'Active' && subscription.expiresAt && new Date(`${subscription.expiresAt}T23:59:59.999`).getTime() < Date.now()) {
    const expired: Subscription = { ...subscription, status: 'Expired' }
    write(`subscription:${user?.id ?? 'anonymous'}`, expired)
    return expired
  }
  return subscription
}

export async function incrementLessonViews(id: string): Promise<void> {
  const user = await getCurrentUser()
  if (user?.role !== 'student') return
  if (!await getLesson(id)) throw new Error('Lesson not available')
  const views = read<Record<string, number>>('lessonViews', {})
  views[id] = (views[id] ?? 0) + 1
  write('lessonViews', views)
  write(`lastViewed:${user.id}`, id)
}

export async function blockUser(id: string, blocked: boolean): Promise<ApiResult<User[]>> {
  const admin = await getCurrentUser()
  if (admin?.role !== 'admin') return { ok: false, error: 'Admin permission required' }
  const users = read<User[]>('users', demoUsers)
  const next = users.map((user) => user.id === id ? { ...user, blocked } : user)
  write('users', next)
  const updatedUser = next.find((user) => user.id === id)
  if (updatedUser) {
    const credentials = await getAuthCredentials()
    await saveAuthCredentials(credentials.map((item) => item.user.id === id ? { ...item, user: updatedUser } : item))
  }
  return { ok: true, data: next }
}
export async function getUsers(): Promise<User[]> {
  const admin = await getCurrentUser()
  return admin?.role === 'admin' ? read<User[]>('users', demoUsers).map(normalizeSeedUser) : []
}

export async function createLiveSession(session: Omit<LiveSession, 'id' | 'cancelled'>): Promise<ApiResult<LiveSession>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  if (user.role === 'teacher' && session.teacherId !== user.id) return { ok: false, error: 'You can only create your own sessions' }
  if (!isValidLiveSession(session)) return { ok: false, error: 'Invalid live session details' }
  const next = { ...session, ...(user.role === 'teacher' ? { teacher: user.name, teacherId: user.id } : {}), id: `live-${Date.now()}`, cancelled: false }
  write('liveSessions', [next, ...read<LiveSession[]>('liveSessions', [])])
  return { ok: true, data: next }
}

export async function updateLiveSession(id: string, changes: Partial<Omit<LiveSession, 'id' | 'teacherId'>>): Promise<ApiResult<LiveSession>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const sessions = read<LiveSession[]>('liveSessions', [])
  const current = sessions.find((session) => session.id === id)
  if (!current || (user.role !== 'admin' && current.teacherId !== user.id)) return { ok: false, error: 'You can only edit your own sessions' }
  const next = { ...current, ...changes }
  if (!isValidLiveSession(next)) return { ok: false, error: 'Invalid live session details' }
  write('liveSessions', [next, ...sessions.filter((session) => session.id !== id)])
  return { ok: true, data: next }
}

function isValidLiveSession(session: Pick<LiveSession, 'title' | 'date' | 'time' | 'meetingUrl'> & Partial<Pick<LiveSession, 'replay'>>): boolean {
  const validWebUrl = (value: string) => {
    try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false }
  }
  const date = new Date(`${session.date}T00:00:00Z`)
  return session.title.trim().length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(session.date)
    && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === session.date
    && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(session.time) && validWebUrl(session.meetingUrl)
    && (!session.replay || validWebUrl(session.replay))
}

export async function cancelLiveSession(id: string): Promise<ApiResult<LiveSession>> {
  return updateLiveSession(id, { cancelled: true })
}

export async function getTeacherLessons(): Promise<Lesson[]> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return []
  const views = read<Record<string, number>>('lessonViews', {})
  return allLessons().filter((lesson) => user.role === 'admin' || lesson.teacherId === user.id).map((lesson) => ({ ...lesson, views: views[lesson.id] ?? lesson.views }))
}

export async function saveLesson(input: LessonInput): Promise<ApiResult<Lesson>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const existing = allLessons().find((lesson) => lesson.id === input.id)
  if (existing && user.role !== 'admin' && existing.teacherId !== user.id) return { ok: false, error: 'You can only edit your own lessons' }
  if (input.teacherId !== user.id && user.role !== 'admin') return { ok: false, error: 'You can only publish lessons under your own account' }
  if (!input.id || input.title.trim().length < 2 || !Number.isInteger(input.duration) || input.duration <= 0
    || input.summary.trim().length < 10 || !Array.isArray(input.exercises) || input.exercises.length === 0
    || input.exercises.some((exercise) => !exercise.prompt.trim() || !exercise.correction.trim())
    || !input.quiz.title.trim() || input.quiz.questions.length === 0
    || input.quiz.questions.some((question) => question.prompt.trim().length === 0 || question.choices.length !== 4
      || question.choices.some((choice) => !choice.trim()) || !Number.isInteger(question.answer)
      || question.answer < 0 || question.answer > 3 || !question.explanation.trim())
    || !Number.isInteger(input.order) || input.order < 0) return { ok: false, error: 'Invalid lesson details' }
  let url: URL
  try {
    url = new URL(input.videoUrl)
  } catch {
    return { ok: false, error: 'Video URL must be a valid YouTube, Vimeo or Bunny URL' }
  }
  const host = url.hostname.toLowerCase()
  const path = url.pathname.split('/').filter(Boolean)
  const youtube = host === 'youtu.be' ? path.length > 0
    : host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com')
      ? Boolean(url.searchParams.get('v') || path.some((part, index) => ['embed', 'shorts'].includes(part) && path[index + 1]))
      : false
  const vimeo = (host === 'vimeo.com' || host.endsWith('.vimeo.com')) && path.some((part) => /^\d+$/.test(part))
  const bunny = (host === 'iframe.mediadelivery.net' && path[0] === 'embed' && path.length >= 3)
    || (host === 'bunnycdn.com' || host.endsWith('.bunnycdn.com') || host === 'b-cdn.net' || host.endsWith('.b-cdn.net')) && path.length > 0
  if (url.protocol !== 'https:' || !(youtube || vimeo || bunny)) return { ok: false, error: 'Video URL must be a valid YouTube, Vimeo or Bunny URL' }
  if (input.pdfUrl && !input.pdfUrl.startsWith('data:application/pdf;base64,')) return { ok: false, error: 'PDF must be uploaded as a validated PDF file' }
  if (input.pdfUrl) {
    const encoded = input.pdfUrl.slice('data:application/pdf;base64,'.length)
    const decodedSize = Math.floor(encoded.length * 3 / 4) - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0)
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || decodedSize > 3 * 1024 * 1024 || !validFileSignature(encoded, 'application/pdf')) return { ok: false, error: 'PDF must be uploaded as a validated PDF file' }
  }
  if (!subjects.some((subject) => subject.id === input.subjectId && subject.chapters.some((chapter) => chapter.id === input.chapterId))) {
    return { ok: false, error: 'Assign this lesson to an existing subject and chapter' }
  }
  if (user.role === 'teacher') {
    const assignments = read<Record<string, string[]>>('teacherAssignments', { 'teacher-1': ['math'], 'teacher-2': ['physics'] })
    if (!assignments[user.id]?.includes(input.subjectId ?? '')) return { ok: false, error: 'This subject is not assigned to your account' }
  }
  const lesson: Lesson = { ...input, views: allLessons().find((item) => item.id === input.id)?.views ?? 0 }
  const saved = read<Lesson[]>('lessons', [])
  write('deletedLessons', read<string[]>('deletedLessons', []).filter((id) => id !== lesson.id))
  write('lessons', [lesson, ...saved.filter((item) => item.id !== lesson.id)])
  return { ok: true, data: lesson }
}

export async function deleteLesson(id: string): Promise<ApiResult<null>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const lesson = allLessons().find((item) => item.id === id)
  if (!lesson || (user.role !== 'admin' && lesson.teacherId !== user.id)) return { ok: false, error: 'You can only delete your own lessons' }
  write('deletedLessons', [...new Set([...read<string[]>('deletedLessons', []), id])])
  return { ok: true, data: null }
}

export async function reorderLessons(changes: ReorderLessonInput[]): Promise<ApiResult<Lesson[]>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const owned = await getTeacherLessons()
  if (changes.some(({ lessonId }) => !owned.some((lesson) => lesson.id === lessonId))) {
    return { ok: false, error: 'You can only reorder your own lessons' }
  }
  const byId = new Map(changes.map(({ lessonId, order }) => [lessonId, order]))
  const updated = owned.map((lesson) => byId.has(lesson.id) ? { ...lesson, order: byId.get(lesson.id)! } : lesson)
  const saved = read<Lesson[]>('lessons', [])
  write('lessons', [...updated.filter((lesson) => !saved.some((item) => item.id === lesson.id)), ...saved.map((lesson) => updated.find((item) => item.id === lesson.id) ?? lesson)])
  return { ok: true, data: updated }
}

export async function saveExam(input: Exam): Promise<ApiResult<Exam>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const saved = read<Exam[]>('exams', [])
  const existing = saved.find((exam) => exam.id === input.id)
  const teacherId = user.role === 'teacher' ? user.id : input.teacherId ?? user.id
  const ownerId = existing ? existing.teacherId ?? (existing.subjectId === 'math' ? 'teacher-1' : 'teacher-2') : undefined
  if (user.role === 'teacher' && existing && ownerId !== user.id) return { ok: false, error: 'You can only edit your own exam entries' }
  if (!input.id || !subjects.some((subject) => subject.id === input.subjectId) || !input.session.trim()
    || !Number.isInteger(input.year) || input.year < 1990 || input.year > 2100
    || input.statement.trim().length < 10 || input.correction.trim().length < 10) return { ok: false, error: 'Invalid exam details' }
  if (user.role === 'teacher') {
    const assignments = read<Record<string, string[]>>('teacherAssignments', { 'teacher-1': ['math'], 'teacher-2': ['physics'] })
    if (!assignments[user.id]?.includes(input.subjectId)) return { ok: false, error: 'This subject is not assigned to your account' }
  }
  const result = { ...input, teacherId }
  write('exams', [result, ...saved.filter((exam) => exam.id !== input.id)])
  return { ok: true, data: result }
}

export async function getTeacherExams(): Promise<Exam[]> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return []
  return (await getExams()).map((exam) => ({ ...exam, teacherId: exam.teacherId ?? (exam.subjectId === 'math' ? 'teacher-1' : 'teacher-2') }))
    .filter((exam) => user.role === 'admin' || exam.teacherId === user.id)
}

export async function deleteExam(id: string): Promise<ApiResult<null>> {
  const user = await getCurrentUser()
  if (user?.role !== 'teacher' && user?.role !== 'admin') return { ok: false, error: 'Teacher permission required' }
  const rows = read<Exam[]>('exams', [])
  const exam = rows.find((item) => item.id === id)
  const ownerId = exam?.teacherId ?? (exam?.subjectId === 'math' ? 'teacher-1' : 'teacher-2')
  if (!exam || (user.role === 'teacher' && ownerId !== user.id)) return { ok: false, error: 'You can only delete your own exam entries' }
  write('exams', rows.filter((item) => item.id !== id))
  return { ok: true, data: null }
}

export async function getSettings(): Promise<PlatformSettings> {
  return read('settings', { monthlyPrice: 12, paymentInstructions: 'D17: 22 000 000\nFlouci: 55 000 000' })
}

export async function saveSettings(input: PlatformSettings): Promise<ApiResult<PlatformSettings>> {
  const user = await getCurrentUser()
  if (user?.role !== 'admin') return { ok: false, error: 'Admin permission required' }
  if (!Number.isFinite(input.monthlyPrice) || input.monthlyPrice <= 0 || input.paymentInstructions.trim().length < 5) return { ok: false, error: 'Monthly price and payment instructions are invalid' }
  write('settings', input)
  return { ok: true, data: input }
}

export async function createTeacherAccount(input: Omit<User, 'id' | 'role'>): Promise<ApiResult<User>> {
  const admin = await getCurrentUser()
  if (admin?.role !== 'admin') return { ok: false, error: 'Admin permission required' }
  if (input.name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || !/^\+?[\d\s()-]{8,}$/.test(input.phone)) return { ok: false, error: 'Invalid teacher details' }
  const users = await getUsers()
  if (users.some((user) => user.email.toLowerCase() === input.email.toLowerCase()
    || user.phone.replace(/\s/g, '') === input.phone.replace(/\s/g, ''))) return { ok: false, error: 'This email or phone is already registered' }
  const teacher: User = { ...input, id: `teacher-${Date.now()}`, role: 'teacher' }
  write('users', [...users, teacher])
  return { ok: true, data: teacher }
}

export async function assignTeacherSubjects(input: TeacherAssignment): Promise<ApiResult<TeacherAssignment>> {
  const admin = await getCurrentUser()
  if (admin?.role !== 'admin') return { ok: false, error: 'Admin permission required' }
  const teacher = (await getUsers()).find((user) => user.id === input.teacherId && user.role === 'teacher')
  if (!teacher) return { ok: false, error: 'Teacher not found' }
  if (input.subjectIds.some((id) => !subjects.some((subject) => subject.id === id))) return { ok: false, error: 'Unknown subject' }
  const assignments = read<Record<string, string[]>>('teacherAssignments', { 'teacher-1': ['math'], 'teacher-2': ['physics'] })
  assignments[input.teacherId] = input.subjectIds
  write('teacherAssignments', assignments)
  return { ok: true, data: input }
}

export async function getTeacherAssignments(teacherId: string): Promise<string[]> {
  const admin = await getCurrentUser()
  if (admin?.role !== 'admin') return []
  const teacher = (await getUsers()).find((user) => user.id === teacherId && user.role === 'teacher')
  if (!teacher) return []
  return read<Record<string, string[]>>('teacherAssignments', { 'teacher-1': ['math'], 'teacher-2': ['physics'] })[teacherId] ?? []
}

export async function getAdminMetrics(): Promise<{ students: number; activeSubscriptions: number; revenue: number; pendingPayments: number; lessons: number }> {
  const admin = await getCurrentUser()
  if (admin?.role !== 'admin') return { students: 0, activeSubscriptions: 0, revenue: 0, pendingPayments: 0, lessons: 0 }
  const users = await getUsers()
  const payments = await getPayments()
  const subscriptions = users.filter((user) => user.role === 'student').map((user) => read<Subscription>(`subscription:${user.id}`, { status: 'None' }))
  return {
    students: users.filter((user) => user.role === 'student' && !user.blocked).length,
    activeSubscriptions: subscriptions.filter((subscription) => subscription.status === 'Active'
      && (!subscription.expiresAt || new Date(`${subscription.expiresAt}T23:59:59.999`).getTime() >= Date.now())).length,
    revenue: payments.filter((payment) => payment.status === 'Approved').reduce((total, payment) => total + payment.amount, 0),
    pendingPayments: payments.filter((payment) => payment.status === 'Pending').length,
    lessons: allLessons().length,
  }
}

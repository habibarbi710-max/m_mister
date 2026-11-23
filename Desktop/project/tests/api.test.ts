import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/lib/api'
import { dataProvider } from '@/lib/data/config'
import type { GroupPayment, LessonInput, LiveSession, Payment, User, WeeklySlot } from '@/types'
import { calculateQuizScore } from '@/lib/quiz-score'
import { subjects, demoUsers } from '@/lib/mock-data'
import { parseVideoUrl } from '@/lib/video/parse'
import { calculateGroupAverage } from '@/lib/grades'
import { generateWeeklySessionDates, hasSessionConflict, rankWeeklySlots } from '@/lib/group-scheduling'

const student = demoUsers.find((user) => user.role === 'student')!
const teacher = demoUsers.find((user) => user.role === 'teacher')!
const admin = demoUsers.find((user) => user.role === 'admin')!
const otherTeacher: User = { ...teacher, id: 'teacher-2', email: 'other@edubac.tn' }
const otherStudent: User = { ...student, id: 'student-2', name: 'Youssef Ben Ali', email: 'youssef@edubac.tn', phone: '+216 21 222 333' }

function installStorage() {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        get length() { return values.size },
        getItem: (key: string) => values.get(key) ?? null,
        key: (index: number) => [...values.keys()][index] ?? null,
        removeItem: (key: string) => { values.delete(key) },
        setItem: (key: string, value: string) => { values.set(key, value) },
      },
    },
  })
}

function makeSession(overrides: Partial<LiveSession> = {}): LiveSession {
  return {
    id: 'session-1',
    title: 'Cours de révision',
    description: 'Révision du chapitre.',
    subjectId: 'math',
    teacherId: teacher.id,
    date: '2026-02-10',
    startTime: '10:00',
    durationMinutes: 60,
    provider: 'external',
    externalUrl: 'https://meet.example.com/room',
    status: 'scheduled',
    replayUrl: 'https://example.com/replay',
    resources: [],
    createdAt: '2026-01-01T10:00:00.000Z',
    ...overrides,
  }
}

function makeLessonInput(subjectId: string, chapterId: string, status: 'draft' | 'published' = 'published'): LessonInput {
  return {
    id: 'authored-lesson',
    title: 'Les bases de la cellule',
    duration: 24,
    videoUrl: 'https://youtu.be/abcdefg',
    videos: [{ id: 'authored-video', title: 'Cours', provider: 'youtube', url: 'https://youtu.be/abcdefg', durationSeconds: 1200, order: 0 }],
    summary: 'Une introduction complète aux notions essentielles de la cellule.',
    pdfUrl: '',
    exercises: [{ prompt: 'Définissez la cellule.', correction: 'La cellule est l’unité fondamentale du vivant.' }],
    quiz: {
      id: 'authored-quiz',
      title: 'Vérifiez vos acquis',
      questions: [{ id: 'authored-question', prompt: 'Combien de choix ?', choices: ['Un', 'Deux', 'Trois', 'Quatre'], answer: 3, explanation: 'Le questionnaire propose quatre choix.' }],
    },
    isFree: true,
    subjectId,
    chapterId,
    status,
    order: 0,
  }
}

async function setCurrentUser(user: User | null) {
  await dataProvider.write('user', user)
}

async function enablePayments() {
  const settings = await api.getSettings()
  await dataProvider.write('settings', { ...settings, paymentsEnabled: true })
}

async function setGroupMonthlyPrice(groupId: string, monthlyPrice: number | null) {
  const result = await dataProvider.read('classGroups')
  if (!result.ok) throw new Error(result.error.message)
  await dataProvider.write('classGroups', result.data.map((group) =>
    group.id === groupId ? { ...group, monthlyPrice } : group))
}

async function seedPendingPayment(plan: Payment['plan'] = 'quarterly') {
  const payment: Payment = {
    id: 'payment-1',
    userId: student.id,
    userName: student.name,
    phone: student.phone,
    plan,
    amount: plan === 'quarterly' ? 36 : plan === 'annual' ? 120 : 12,
    submittedAt: '2026-01-31',
    status: 'Pending',
    receipt: 'data:application/pdf;base64,JVBERi0=',
    receiptType: 'application/pdf',
  }
  await dataProvider.write('payments', [payment])
  return payment
}

beforeEach(async () => {
  installStorage()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-31T12:00:00.000Z'))
  await dataProvider.reset()
  await dataProvider.write('users', demoUsers.map((user) =>
    user.id === otherStudent.id ? otherStudent : user.id === otherTeacher.id ? otherTeacher : user))
})

afterEach(() => {
  vi.useRealTimers()
  Reflect.deleteProperty(globalThis, 'window')
})

describe('content access rules', () => {
  it('rejects structurally invalid persisted data', async () => {
    window.localStorage.setItem('edubac:theme', JSON.stringify('ultraviolet'))

    expect(await dataProvider.read('theme')).toMatchObject({
      ok: false,
      error: { code: 'invalid-data' },
    })
  })

  it('migrates legacy curriculum data into the versioned storage key', async () => {
    window.localStorage.setItem('edubac:subjects', JSON.stringify([{
      id: 'legacy-subject', title: 'Histoire', titleFr: 'Histoire', color: 'blue', icon: 'book',
      description: 'Programme historique', chapters: [{ id: 'legacy-module', title: 'Introduction', lessons: [] }],
    }]))

    const result = await dataProvider.read('subjects')

    expect(result).toMatchObject({
      ok: true,
      data: [{
        id: 'legacy-subject',
        order: 0,
        ownerIds: ['teacher-1'],
        status: 'published',
        chapters: [{ id: 'legacy-module', ownerId: 'teacher-1', status: 'published', lessons: [] }],
      }],
    })
    expect(window.localStorage.getItem('edubac:v2:subjects')).not.toBeNull()
  })

  it('allows free lessons and blocks private lessons without an accepted group enrollment', async () => {
    await setCurrentUser(student)
    expect(await api.getLesson('lesson-1')).toMatchObject({ isFree: true })
    await dataProvider.write('groupEnrollments', [])
    expect(await api.getLesson('lesson-2')).toBeUndefined()
  })

  it('keeps the existing platform payment approval flow behind the payments setting', async () => {
    await enablePayments()
    const payment = await seedPendingPayment()
    await setCurrentUser(admin)
    expect((await api.approvePayment(payment.id, true)).ok).toBe(true)
    await setCurrentUser(student)
    expect(await api.hasSubscriptionAccess('platform')).toBe(true)
  })

  it('hides group live rooms from students without an accepted enrollment', async () => {
    await dataProvider.write('groupEnrollments', [])
    await dataProvider.write('liveSessions', [makeSession({ groupId: 'group-math-math' })])
    await setCurrentUser(student)

    expect(await api.getLiveSession('session-1')).toBeUndefined()
  })

  it('marks an expired platform subscription and keeps group content payment-gated when enabled', async () => {
    await enablePayments()
    await setGroupMonthlyPrice('group-math-math', 20)
    await setCurrentUser(student)
    await dataProvider.write(`subscription:${student.id}`, { status: 'Active', expiresAt: '2026-01-30' })

    expect(await api.getSubscription()).toMatchObject({ status: 'Expired' })
    expect(await api.getLesson('lesson-2')).toBeUndefined()
  })
})

describe('payments and roles', () => {
  it.each([
    ['monthly', '2026-02-28'],
    ['quarterly', '2026-04-30'],
    ['annual', '2026-11-30'],
  ] as const)('grants the %s plan duration and clamps month-end expiry', async (plan, expiresAt) => {
    await enablePayments()
    const payment = await seedPendingPayment(plan)
    await setCurrentUser(admin)

    const result = await api.approvePayment(payment.id, true)
    expect(result.ok).toBe(true)
    expect(await dataProvider.read(`subscription:${student.id}`)).toMatchObject({
      ok: true,
      data: { status: 'Active', plan, expiresAt },
    })
  })

  it('rejects a payment with a reason without activating a subscription', async () => {
    await enablePayments()
    const payment = await seedPendingPayment()
    await setCurrentUser(admin)

    const result = await api.approvePayment(payment.id, false, 'Justificatif illisible')

    expect(result.ok).toBe(true)
    expect(await dataProvider.read(`subscription:${student.id}`)).toMatchObject({
      ok: true,
      data: { status: 'None' },
    })
    expect(await api.getPayments()).toEqual([
      expect.objectContaining({ id: payment.id, status: 'Rejected', rejectionReason: 'Justificatif illisible' }),
    ])
  })

  it('does not expose payment records to teachers', async () => {
    await seedPendingPayment()
    await setCurrentUser(teacher)

    expect(await api.getPayments()).toEqual([])
  })

  it('rejects blocked accounts at sign-in', async () => {
    await dataProvider.write('users', [{ ...student, blocked: true }, teacher, admin, otherTeacher])
    await expect(api.signIn(student.email)).rejects.toThrow('blocked')
  })
})

describe('teacher ownership and quiz scoring', () => {
  it('prevents a teacher from deleting another teacher’s lesson', async () => {
    await setCurrentUser(otherTeacher)
    const result = await api.deleteLesson('lesson-1')

    expect(result).toMatchObject({ ok: false })
    expect((await api.getSubjects()).flatMap((subject) => subject.chapters).flatMap((chapter) => chapter.lessons))
      .toContainEqual(expect.objectContaining({ id: 'lesson-1' }))
  })

  it('prevents a teacher from editing another teacher’s live session', async () => {
    await dataProvider.write('liveSessions', [makeSession({ teacherId: otherTeacher.id })])
    await setCurrentUser(teacher)

    expect(await api.updateLiveSession('session-1', { title: 'Modification non autorisée' }))
      .toMatchObject({ ok: false })
  })

  it('allows a teacher to create a curriculum subject and module', async () => {
    await setCurrentUser(teacher)
    const subject = await api.saveSubject({
      titleFr: 'Biologie', description: 'Cours de biologie cellulaire.',
      icon: 'microscope', color: 'green', sections: ['Sciences expérimentales'],
      status: 'published',
    })
    expect(subject.ok).toBe(true)
    if (!subject.ok) return

    const createdModule = await api.saveModule(subject.data.id, {
      title: 'La cellule', description: 'Notions fondamentales.', order: 0, status: 'published',
    })

    expect(createdModule).toMatchObject({ ok: true, data: { ownerId: teacher.id, status: 'published' } })
  })

  it('hides drafts and unpublished parent nodes from students', async () => {
    await setCurrentUser(teacher)
    const subject = await api.saveSubject({
      titleFr: 'Biologie', description: 'Cours de biologie cellulaire.',
      icon: 'microscope', color: 'green', sections: ['Sciences expérimentales'],
      status: 'published',
    })
    if (!subject.ok) throw new Error(subject.error)
    const createdModule = await api.saveModule(subject.data.id, {
      title: 'La cellule', description: '', order: 0, status: 'draft',
    })
    if (!createdModule.ok) throw new Error(createdModule.error)
    const saved = await api.saveLesson({
      id: 'draft-cell',
      title: 'Membrane cellulaire', duration: 20, videoUrl: '', videos: [], summary: '',
      pdfUrl: '', exercises: [], quiz: { id: 'draft-cell-quiz', title: '', questions: [] },
      isFree: true, subjectId: subject.data.id, chapterId: createdModule.data.id, status: 'draft', order: 0,
    })
    expect(saved.ok).toBe(true)
    await setCurrentUser(student)

    expect(await api.getSubject(subject.data.id)).toMatchObject({ chapters: [] })
    expect(await api.getLesson('draft-cell')).toBeUndefined()
  })

  it('publishes teacher-created curriculum for students and admin can unpublish it', async () => {
    await setCurrentUser(teacher)
    const subject = await api.saveSubject({
      titleFr: 'Biologie', description: 'Cours de biologie cellulaire.',
      icon: 'microscope', color: 'green', sections: ['Sciences expérimentales'],
      status: 'published',
    })
    if (!subject.ok) throw new Error(subject.error)
    const moduleResult = await api.saveModule(subject.data.id, {
      title: 'La cellule', description: '', order: 0, status: 'published',
    })
    if (!moduleResult.ok) throw new Error(moduleResult.error)
    const lesson = await api.saveLesson(makeLessonInput(subject.data.id, moduleResult.data.id))
    expect(lesson.ok).toBe(true)

    await setCurrentUser(student)
    expect(await api.getSubject(subject.data.id)).toMatchObject({
      chapters: [{ lessons: [{ id: 'authored-lesson', status: 'published' }] }],
    })
    expect(await api.getLesson('authored-lesson')).toMatchObject({ title: 'Les bases de la cellule' })

    await setCurrentUser(admin)
    expect(await api.setContentStatus('subject', '', subject.data.id, 'draft')).toMatchObject({ ok: true })
    await setCurrentUser(student)
    expect(await api.getSubject(subject.data.id)).toBeUndefined()
    expect(await api.getLesson('authored-lesson')).toBeUndefined()
  })

  it('prevents another teacher from editing a lesson they do not own', async () => {
    await setCurrentUser(otherTeacher)
    const result = await api.saveLesson({ ...subjects[0].chapters[0].lessons[0], title: 'Modification refusée' })

    expect(result).toMatchObject({ ok: false })
  })

  it('prevents a teacher from deleting a module or subject containing another teacher’s content', async () => {
    await setCurrentUser(teacher)
    const subject = await api.saveSubject({
      titleFr: 'Biologie', description: 'Cours de biologie cellulaire.',
      icon: 'microscope', color: 'green', sections: ['Sciences expérimentales'],
      status: 'published',
    })
    if (!subject.ok) throw new Error(subject.error)
    const moduleResult = await api.saveModule(subject.data.id, {
      title: 'La cellule', description: '', order: 0, status: 'published',
    })
    if (!moduleResult.ok) throw new Error(moduleResult.error)

    await setCurrentUser(otherTeacher)
    const lesson = await api.saveLesson(makeLessonInput(subject.data.id, moduleResult.data.id, 'draft'))
    expect(lesson.ok).toBe(true)

    await setCurrentUser(teacher)
    expect(await api.deleteModule(subject.data.id, moduleResult.data.id)).toMatchObject({ ok: false })
    expect(await api.deleteSubject(subject.data.id)).toMatchObject({ ok: false })
    expect(await api.getSubject(subject.data.id)).toBeDefined()
  })

  it('autosaves an unpublished lesson draft without changing a published student lesson', async () => {
    const original = subjects[0].chapters[0].lessons[0]
    await setCurrentUser(teacher)
    const savedDraft = await api.saveLessonDraft({ ...original, title: 'Brouillon modifié' })
    expect(savedDraft.ok).toBe(true)
    expect(await api.getLesson(original.id)).toMatchObject({ title: 'Brouillon modifié', status: 'draft' })

    await setCurrentUser(student)
    expect(await api.getLesson(original.id)).toMatchObject({ title: original.title, status: 'published' })
  })

  it('orders teacher-owned lessons and restores deleted content within the retention window', async () => {
    await setCurrentUser(teacher)
    const reorder = await api.reorderLessons([
      { lessonId: 'lesson-1', order: 1 },
      { lessonId: 'lesson-2', order: 0 },
    ])
    expect(reorder.ok).toBe(true)
    const math = await api.getSubject('math')
    expect(math?.chapters[0].lessons.slice(0, 2).map((lesson) => lesson.id)).toEqual(['lesson-2', 'lesson-1'])

    const deleted = await api.deleteLesson('lesson-1')
    expect(deleted.ok).toBe(true)
    expect(await api.getLesson('lesson-1')).toBeUndefined()
    const [trashItem] = await api.getContentTrash()
    expect(trashItem?.kind).toBe('lesson')
    if (!trashItem) throw new Error('Expected a trash item')
    expect((await api.restoreContent(trashItem.id)).ok).toBe(true)
    expect(await api.getLesson('lesson-1')).toMatchObject({ id: 'lesson-1' })
  })

  it('calculates the number and percentage of correct quiz answers', () => {
    const questions = subjects[0].chapters[0].lessons[0].quiz.questions

    expect(calculateQuizScore(questions, [1, 0, 1, 0, 0])).toEqual({
      correct: 3,
      total: 5,
      percentage: 60,
    })

  })

  it('saves quiz scores computed from the stored lesson answers', async () => {
    await setCurrentUser(student)
    await dataProvider.write(`subscription:${student.id}`, { status: 'Active', expiresAt: '2026-04-30' })
    await api.submitQuizResult('Asymptotes', 'lesson-2', [1, 1, 1, 2, 0])

    expect(await api.getQuizResults()).toMatchObject([
      { lessonId: 'lesson-2', score: 100, answers: [1, 1, 1, 2, 0] },
    ])
  })

  it('rejects quiz results with missing or out-of-range answers', async () => {
    await setCurrentUser(student)
    await dataProvider.write(`subscription:${student.id}`, { status: 'Active', expiresAt: '2026-04-30' })

    await expect(api.submitQuizResult('Asymptotes', 'lesson-2', [99])).rejects.toThrow('Quiz answers are invalid')
    expect(await api.getQuizResults()).toEqual([])
  })
})

describe('teacher-led class groups', () => {
  it.each([
    ['Écrivez à eleve@example.tn', 'email'],
    ['Téléphone 555-123-4567', 'téléphone'],
    ['Rendez-vous sur https://example.com/room', 'lien externe'],
  ])('masque un %s avant publication', (message) => {
    const masked = api.maskContactInfo(message)
    expect(masked.masked).toBe(true)
    expect(masked.text).toContain('[coordonnées masquées]')
  })

  it('shows a private lesson only through an accepted group enrollment when payments are off', async () => {
    await setCurrentUser(student)
    expect((await api.getSettings()).paymentsEnabled).toBe(false)
    expect(await api.getLesson('lesson-2')).toMatchObject({ id: 'lesson-2' })

    await dataProvider.write('groupEnrollments', [])
    expect(await api.getLesson('lesson-2')).toBeUndefined()
  })

  it('requires a current group payment only when payments are enabled', async () => {
    await enablePayments()
    await setGroupMonthlyPrice('group-math-math', 20)
    await setCurrentUser(student)
    expect(await api.getLesson('lesson-2')).toBeUndefined()

    const submitted = await api.submitGroupPayment(
      'group-math-math', '2026-01', 'data:image/png;base64,iVBORw0KGgo=', 'image/png',
    )
    expect(submitted).toMatchObject({ ok: true, data: { status: 'en attente' } })
    if (!submitted.ok) return
    await setCurrentUser(admin)
    expect(await api.getAdminGroupPayments()).toContainEqual(expect.objectContaining({
      payment: expect.objectContaining({ id: submitted.data.id }), groupName: 'Bac Mathématiques - Math',
    }))
    expect((await api.reviewGroupPayment(submitted.data.id, 'payé')).ok).toBe(true)
    await setCurrentUser(student)
    expect(await api.getLesson('lesson-2')).toMatchObject({ id: 'lesson-2' })
  })

  it('applies the configurable payment grace period to the previous month only', async () => {
    await enablePayments()
    await setGroupMonthlyPrice('group-math-math', 20)
    await dataProvider.write('groupPayments', [{
      id: 'group-payment-grace', groupId: 'group-math-math', studentId: student.id,
      period: '2025-12', status: 'payé', submittedAt: '2025-12-01T00:00:00.000Z',
    } satisfies GroupPayment])
    await setCurrentUser(student)
    vi.setSystemTime(new Date('2026-01-05T12:00:00.000Z'))
    expect(await api.getLesson('lesson-2')).toBeDefined()

    vi.setSystemTime(new Date('2026-01-10T12:00:00.000Z'))
    expect(await api.getLesson('lesson-2')).toBeUndefined()
  })

  it('keeps a full class request pending and rejects acceptance beyond capacity', async () => {
    const newStudent: User = {
      ...student, id: 'student-new', name: 'Sana Ben Salem', email: 'sana@edubac.tn',
      phone: '+216 20 000 111', sectionId: 'math',
    }
    await setCurrentUser(admin)
    const users = await api.getUsers()
    await dataProvider.write('users', [...users, newStudent])
    const groups = await dataProvider.read('classGroups')
    if (!groups.ok) throw new Error(groups.error.message)
    await dataProvider.write('classGroups', groups.data.map((group) =>
      group.id === 'group-math-math' ? { ...group, maxStudents: 3 } : group))
    await setCurrentUser(newStudent)

    const request = await api.requestGroupEnrollment('group-math-math')
    expect(request).toMatchObject({ ok: true, data: { status: 'en attente' } })
    if (!request.ok) return
    await setCurrentUser(teacher)
    expect(await api.decideGroupEnrollment(request.data.id, 'accepté')).toMatchObject({ ok: false })
  })

  it('limits teacher rosters to owned groups and exposes no student contact or payment fields', async () => {
    await setCurrentUser(otherTeacher)
    expect(await api.getTeacherGroupStudents('group-math-math')).toEqual([])

    await setCurrentUser(teacher)
    const roster = await api.getTeacherGroupStudents('group-math-math')
    expect(roster.length).toBeGreaterThan(0)
    expect(roster[0]).toMatchObject({ name: expect.stringMatching(/^[^ ]+ [A-Z]\.$/) })
    expect(roster[0]).not.toHaveProperty('email')
    expect(roster[0]).not.toHaveProperty('phone')
    expect(roster[0]).not.toHaveProperty('payments')
  })

  it('generates timezone-stable weekly sessions and selects the most available slot', () => {
    const slots: WeeklySlot[] = [
      { id: 'sunday', dayOfWeek: 0, startTime: '17:00', durationMinutes: 90 },
      { id: 'tuesday', dayOfWeek: 2, startTime: '19:00', durationMinutes: 90 },
    ]
    const students = [student, otherStudent]
    const results = rankWeeklySlots(slots, [
      { pollId: 'poll', slotId: 'sunday', studentId: student.id, vote: 'Disponible', updatedAt: '2026-01-01' },
      { pollId: 'poll', slotId: 'sunday', studentId: otherStudent.id, vote: 'Disponible', updatedAt: '2026-01-01' },
      { pollId: 'poll', slotId: 'tuesday', studentId: student.id, vote: 'Disponible', updatedAt: '2026-01-01' },
    ], students)
    expect(results[0].slot.id).toBe('sunday')
    expect(generateWeeklySessionDates(slots[0], 2, new Date('2026-01-31T12:00:00.000Z')))
      .toEqual(['2026-02-01', '2026-02-08'])
    expect(hasSessionConflict(
      { date: '2026-02-01', startTime: '17:30', durationMinutes: 60 },
      [{ date: '2026-02-01', startTime: '17:00', durationMinutes: 90 }],
    )).toBe(true)
  })

  it('lets an enrolled student vote, fixes recurring sessions, and notifies the group', async () => {
    const student9 = demoUsers.find((user) => user.id === 'student-9')!
    const teacher2 = demoUsers.find((user) => user.id === 'teacher-2')!
    await setCurrentUser(teacher2)
    const slots: WeeklySlot[] = [
      { id: 'slot-sunday', dayOfWeek: 0, startTime: '17:00', durationMinutes: 90 },
      { id: 'slot-tuesday', dayOfWeek: 2, startTime: '19:00', durationMinutes: 90 },
    ]
    const poll = await api.createSchedulePoll('group-science-math', slots, '2026-02-02T00:00:00.000Z', 3)
    if (!poll.ok) throw new Error(poll.error)
    await setCurrentUser(student9)
    expect((await api.submitScheduleVote(poll.data.id, 'slot-sunday', 'Disponible')).ok).toBe(true)
    await setCurrentUser(teacher2)
    const fixed = await api.fixGroupSchedule(poll.data.id, ['slot-sunday'])

    expect(fixed).toMatchObject({ ok: true, data: { sessions: expect.any(Array) } })
    if (!fixed.ok) return
    expect(fixed.data.sessions).toHaveLength(3)
    expect(await api.getTeacherSchedulePolls()).toContainEqual(expect.objectContaining({
      poll: expect.objectContaining({ id: poll.data.id, status: 'fixé' }),
    }))
    await setCurrentUser(student9)
    expect(await api.getNotifications()).toContainEqual(expect.objectContaining({ type: 'schedule-fixed' }))
  })

  it('masks and moderates reported group announcements', async () => {
    await setCurrentUser(teacher)
    const announcement = await api.publishGroupAnnouncement('group-math-math', {
      title: 'Rappel de séance', body: 'Appelez-moi au 555-123-4567.',
    })
    if (!announcement.ok) throw new Error(announcement.error)
    expect(announcement.data.body).toContain('[coordonnées masquées]')

    await setCurrentUser(student)
    const report = await api.createReport('announcement', announcement.data.id, 'Coordonnées personnelles')
    if (!report.ok) throw new Error(report.error)
    await setCurrentUser(admin)
    expect(await api.moderateReport(report.data.id, 'hide')).toMatchObject({ ok: true })
    await setCurrentUser(student)
    expect(await api.getGroupAnnouncements('group-math-math')).not.toContainEqual(
      expect.objectContaining({ id: announcement.data.id }),
    )
  })

  it('records a required rescheduling reason and notifies the enrolled group', async () => {
    await setCurrentUser(teacher)
    const changed = await api.rescheduleGroupSession(
      'group-math-session-3',
      { date: '2026-12-02', startTime: '18:00' },
      'Indisponibilité du professeur',
    )
    expect(changed).toMatchObject({
      ok: true, data: { date: '2026-12-02', startTime: '18:00', changeReason: 'Indisponibilité du professeur' },
    })
    await setCurrentUser(student)
    expect(await api.getNotifications()).toContainEqual(expect.objectContaining({ type: 'session-rescheduled' }))
  })

  it('keeps student reschedule requests pending until the teacher decides', async () => {
    await setCurrentUser(student)
    const request = await api.requestGroupReschedule(
      'group-math-session-3', 'Conflit avec un examen', '2026-02-02', '18:00',
    )
    if (!request.ok) throw new Error(request.error)
    expect(await dataProvider.read('liveSessions')).toMatchObject({
      ok: true, data: expect.arrayContaining([expect.objectContaining({ id: 'group-math-session-3', date: '2026-11-29' })]),
    })

    await setCurrentUser(teacher)
    expect(await api.getTeacherRescheduleRequests()).toContainEqual(expect.objectContaining({
      request: expect.objectContaining({ id: request.data.id, status: 'en attente' }),
    }))
    expect((await api.decideGroupRescheduleRequest(request.data.id, 'accepté')).ok).toBe(true)
    expect(await dataProvider.read('liveSessions')).toMatchObject({
      ok: true, data: expect.arrayContaining([expect.objectContaining({ id: 'group-math-session-3', date: '2026-02-02' })]),
    })
  })

  it('closes a past session, records attendance and supports homework correction', async () => {
    const liveSessions = await dataProvider.read('liveSessions')
    if (!liveSessions.ok) throw new Error(liveSessions.error.message)
    await dataProvider.write('liveSessions', [...liveSessions.data, makeSession({
      id: 'past-group-session', groupId: 'group-math-math', date: '2026-01-30',
    })])
    await setCurrentUser(teacher)
    const roster = await api.getGroupSessionRoster('past-group-session')
    const closed = await api.closeGroupSession('past-group-session', {
      attendance: roster.map((row) => ({ studentId: row.studentId, status: 'présent' })),
      coveredLessonIds: ['lesson-1'],
      summary: 'Limites et exercices.',
      homework: {
        title: 'Exercice sur les limites', instructions: 'Rédigez la solution.',
        dueAt: '2026-02-01T00:00:00.000Z', maxPoints: 20, allowedTypes: ['text'],
      },
    })
    expect(closed.ok).toBe(true)
    expect(await api.getLiveSession('past-group-session')).toMatchObject({ status: 'ended' })

    const assignments = await dataProvider.read('homeworkAssignments')
    if (!assignments.ok) throw new Error(assignments.error.message)
    const assignment = assignments.data.find((item) => item.groupId === 'group-math-math')
    if (!assignment) throw new Error('Expected the homework assignment')
    await setCurrentUser(student)
    const submission = await api.submitHomework(assignment.id, { text: 'Voici ma solution.' })
    if (!submission.ok) throw new Error(submission.error)
    await setCurrentUser(teacher)
    expect((await api.gradeHomework(submission.data.id, 18, 'Bonne démarche.')).ok).toBe(true)
    await setCurrentUser(student)
    expect(await api.getMyHomework()).toContainEqual(expect.objectContaining({
      assignment: expect.objectContaining({ id: assignment.id }),
      status: 'corrigé',
      submission: expect.objectContaining({ grade: 18 }),
    }))
  })

  it('calculates weighted group averages and ignores absences', () => {
    expect(calculateGroupAverage([
      { score: 10, maxPoints: 20, coefficient: 1, type: 'devoir', absent: false },
      { score: 18, maxPoints: 20, coefficient: 3, type: 'oral', absent: false },
      { maxPoints: 20, coefficient: 1, type: 'quiz', absent: true },
    ])).toBe(16)
  })
})

describe('teacher and student relationship rules', () => {
  it('keeps teacher student views limited to followers and strips contact and payment data', async () => {
    await dataProvider.write('teacherFollows', [{
      teacherId: teacher.id, studentId: student.id, followedAt: '2026-01-01T00:00:00.000Z',
      lastVisitedAt: '2026-01-01T00:00:00.000Z',
    }])
    await seedPendingPayment()
    await setCurrentUser(teacher)

    const students = await api.getTeacherStudents()
    expect(students).toHaveLength(1)
    expect(students[0]).toMatchObject({ id: student.id, name: 'Amna A.', section: student.section })
    expect(students[0]).not.toHaveProperty('email')
    expect(students[0]).not.toHaveProperty('phone')
    expect(students[0]).not.toHaveProperty('payments')
    expect(await api.getPayments()).toEqual([])
  })

  it('masks phone numbers in private messages and sends them to moderation', async () => {
    await setCurrentUser(student)

    const result = await api.sendTeacherMessage(teacher.id, 'Appelez-moi au 555-123-4567')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.text).toContain('[coordonnées masquées]')
    expect(result.data.text).not.toContain('555-123-4567')
    expect(result.data.flagged).toBe(true)
    await setCurrentUser(admin)
    expect(await api.getReports()).toEqual([
      expect.objectContaining({ targetType: 'message', targetId: result.data.id, status: 'pending' }),
    ])
  })

  it('limits student questions and messages to the configurable hourly maximum', async () => {
    await dataProvider.write('relationshipSettings', {
      messagingEnabled: true, messagesPerHour: 1, bannedWords: [], disabledMessagingUserIds: [],
    })
    await setCurrentUser(student)

    expect((await api.askLessonQuestion('lesson-1', 'Pouvez-vous expliquer ce passage ?')).ok).toBe(true)
    expect(await api.sendTeacherMessage(teacher.id, 'Bonjour, j’ai une question.')).toMatchObject({ ok: false })
  })

  it('allows a student to follow and unfollow a teacher without exposing contact data', async () => {
    await setCurrentUser(student)

    expect((await api.followTeacher(teacher.id)).ok).toBe(true)
    expect(await api.getMyTeachers()).toEqual([
      expect.objectContaining({ id: teacher.id, name: teacher.name, followerCount: 1, newLessonCount: 0 }),
    ])
    expect(await api.getTeacherProfile(teacher.id)).not.toHaveProperty('email')
    expect((await api.unfollowTeacher(teacher.id)).ok).toBe(true)
    expect(await api.getMyTeachers()).toEqual([])
  })

  it('requires a completed lesson to rate and permits one editable rating per student', async () => {
    await setCurrentUser(student)

    expect(await api.rateLesson('lesson-1', 5)).toMatchObject({ ok: false })
    await api.completeLesson('lesson-1')
    const first = await api.rateLesson('lesson-1', 4, 'Très clair')
    expect(first).toMatchObject({ ok: true, data: { stars: 4, comment: 'Très clair' } })
    const edited = await api.rateLesson('lesson-1', 5, 'Excellent')
    expect(edited).toMatchObject({ ok: true, data: { stars: 5, comment: 'Excellent' } })
    const ratings = await dataProvider.read('lessonRatings')
    if (!ratings.ok) throw new Error(ratings.error.message)
    expect(ratings.data).toHaveLength(1)
  })

  it('supports teacher replies, answer marking, and pinning while rejecting other teachers', async () => {
    await setCurrentUser(student)
    const question = await api.askLessonQuestion('lesson-1', 'Comment appliquer cette méthode ?')
    if (!question.ok) throw new Error(question.error)
    await setCurrentUser(otherTeacher)
    expect(await api.markLessonQuestionAnswered(question.data.id)).toMatchObject({ ok: false })
    await setCurrentUser(teacher)
    const reply = await api.answerLessonQuestion(question.data.id, 'Commencez par identifier les données.')
    if (!reply.ok) throw new Error(reply.error)
    expect(reply.data.answers[0].teacherAnswer).toBe(true)
    expect((await api.markLessonQuestionAnswered(question.data.id)).ok).toBe(true)
    expect((await api.pinLessonQuestionAnswer(question.data.id, reply.data.answers[0].id)).ok).toBe(true)
    await setCurrentUser(student)
    expect(await api.getNotifications()).toEqual([
      expect.objectContaining({ type: 'question-reply' }),
    ])
  })

  it('submits homework, prevents resubmission after grading, and notifies the student', async () => {
    await setCurrentUser(teacher)
    const assignment = await api.saveHomeworkAssignment({
      lessonId: 'lesson-1', title: 'Exercice guidé', instructions: 'Rédigez les étapes.',
      dueAt: '2026-02-01T00:00:00.000Z', maxPoints: 20, allowedTypes: ['text'],
    })
    if (!assignment.ok) throw new Error(assignment.error)
    await setCurrentUser(student)
    const submitted = await api.submitHomework(assignment.data.id, { text: 'Voici ma démarche.' })
    if (!submitted.ok) throw new Error(submitted.error)
    expect(submitted.data.late).toBe(false)
    await setCurrentUser(teacher)
    expect((await api.gradeHomework(submitted.data.id, 17, 'Bonne méthode.')).ok).toBe(true)
    await setCurrentUser(student)
    expect(await api.submitHomework(assignment.data.id, { text: 'Nouvelle version.' })).toMatchObject({ ok: false })
    expect(await api.getMyHomework()).toEqual([
      expect.objectContaining({ status: 'corrigé', submission: expect.objectContaining({ grade: 17 }) }),
    ])
    expect(await api.getNotifications()).toEqual([
      expect.objectContaining({ type: 'homework-graded' }),
    ])
  })

  it('routes reports to the admin queue and records moderation actions', async () => {
    await setCurrentUser(student)
    const sent = await api.sendTeacherMessage(teacher.id, 'Bonjour.')
    if (!sent.ok) throw new Error(sent.error)
    const report = await api.createReport('message', sent.data.id, 'Contenu inapproprié')
    if (!report.ok) throw new Error(report.error)
    await setCurrentUser(admin)
    expect(await api.getReports()).toContainEqual(expect.objectContaining({ id: report.data.id, status: 'pending' }))
    expect(await api.moderateReport(report.data.id, 'hide')).toMatchObject({ ok: true, data: { action: 'hide' } })
    expect(await api.getModerationActions()).toContainEqual(expect.objectContaining({ reportId: report.data.id }))
  })

  it('keeps platform subscriptions explicit and rejects unimplemented scopes', async () => {
    await setCurrentUser(student)
    await dataProvider.write('groupEnrollments', [])
    await dataProvider.write(`subscription:${student.id}`, {
      status: 'Active', expiresAt: '2026-04-30', scope: 'teacher',
    })

    expect(await api.hasSubscriptionAccess('platform')).toBe(false)
    expect(await api.getLesson('lesson-2')).toBeUndefined()
    await setCurrentUser(admin)
    expect(await api.saveSettings({
      monthlyPrice: 12, paymentInstructions: 'Paiement plateforme',
      canCreateSubjects: true, subscriptionScope: 'subject',
    })).toMatchObject({ ok: false })
  })

  it('records teacher engagement on lesson completion for the admin report', async () => {
    await setCurrentUser(student)
    await api.completeLesson('lesson-1')
    await setCurrentUser(admin)

    expect(await api.getAdminEngagementReport()).toEqual([
      expect.objectContaining({ teacherId: teacher.id, lessonsCompleted: 1, activeStudents: 1 }),
    ])
    expect((await api.setTeacherRevenueShare(teacher.id, 12)).ok).toBe(true)
  })
})

describe('video URL parsing', () => {
  it.each([
    ['https://youtu.be/abcdefg', 'youtube'],
    ['https://vimeo.com/123456789', 'vimeo'],
    ['https://iframe.mediadelivery.net/embed/12345/abcdef', 'bunny'],
    ['https://cdn.example.com/lesson.mp4', 'mp4'],
  ] as const)('detects %s as %s', (url, provider) => {
    expect(parseVideoUrl(url)).toMatchObject({ ok: true, data: { provider } })
  })

  it('rejects unsupported and insecure video links', () => {
    expect(parseVideoUrl('http://youtu.be/abcdefg').ok).toBe(false)
    expect(parseVideoUrl('https://example.com/watch/1').ok).toBe(false)
  })
})

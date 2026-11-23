import { demoUsers, subjects } from '@/lib/mock-data'
import {
  demoClassLogEntries,
  demoGroupAnnouncements,
  demoGroupAssessments,
  demoGroupAttendance,
  demoGroupContentLinks,
  demoGroupEnrollments,
  demoGroupPayments,
  demoGroups,
  demoGradeAuditLog,
  demoLiveSessions,
  demoSchedulePolls,
  demoSchedulePollVotes,
  demoSections,
  demoStudentGrades,
} from '@/lib/group-seed'
import { demoGroupRescheduleRequests } from '@/lib/group-seed'
import type { DataKey, DataProvider, DataResult, DataValue } from '@/lib/data/provider'
import { z } from 'zod'
import { liveAttendanceSchema, liveQuestionSchema, liveSessionSchema } from '@/lib/live-schemas'

const ownedFields = {
  ownerId: z.string().min(1),
  status: z.enum(['draft', 'published']),
  order: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}
const userSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  section: z.string().min(1),
  sectionId: z.string().optional(),
  role: z.enum(['student', 'teacher', 'admin']),
  blocked: z.boolean().optional(),
  avatarUrl: z.string().optional(),
})
const questionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string(),
  choices: z.array(z.string()).length(4),
  answer: z.number().int().min(0).max(3),
  explanation: z.string(),
})
const exerciseSchema = z.object({
  ...ownedFields,
  id: z.string().min(1),
  prompt: z.string(),
  correction: z.string(),
})
const quizSchema = z.object({
  ...ownedFields,
  id: z.string().min(1),
  title: z.string(),
  questions: z.array(questionSchema),
})
const videoSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  provider: z.enum(['bunny', 'vimeo', 'youtube', 'mp4']),
  url: z.string(),
  durationSeconds: z.number().nonnegative(),
  order: z.number().int(),
})
const lessonSchema = z.object({
  ...ownedFields,
  id: z.string().min(1),
  title: z.string(),
  duration: z.number(),
  videoUrl: z.string(),
  videos: z.array(videoSchema),
  summary: z.string(),
  pdfUrl: z.string(),
  exercises: z.array(exerciseSchema),
  quiz: quizSchema,
  isFree: z.boolean(),
  teacherId: z.string(),
  subjectId: z.string().optional(),
  chapterId: z.string().optional(),
  status: z.enum(['draft', 'published']),
  order: z.number().int(),
  views: z.number(),
})
const subjectSchema = z.object({
  id: z.string(),
  order: z.number().int(),
  title: z.string(),
  titleFr: z.string(),
  color: z.string(),
  icon: z.string(),
  description: z.string(),
  sections: z.array(z.string()),
  status: z.enum(['draft', 'published']),
  ownerIds: z.array(z.string().min(1)),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  chapters: z.array(z.object({
    ...ownedFields,
    id: z.string(),
    title: z.string(),
    description: z.string(),
    lessons: z.array(lessonSchema),
  })),
})
function isLegacyLiveSession(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return typeof row.id === 'string'
    && typeof row.title === 'string'
    && typeof row.teacherId === 'string'
    && typeof row.date === 'string'
    && (typeof row.startTime === 'string' || typeof row.time === 'string')
}

const migrationTimestamp = '2026-01-01T00:00:00.000Z'
const homeworkFileSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']),
  data: z.string().min(1),
})
const lessonAnswerSchema = z.object({
  id: z.string().min(1),
  authorId: z.string().min(1),
  text: z.string(),
  createdAt: z.string(),
  teacherAnswer: z.boolean(),
  hidden: z.boolean().optional(),
})

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function migrateLesson(value: unknown, fallbackOrder: number, subjectId?: string, chapterId?: string): unknown {
  const row = record(value)
  const lessonId = text(row.id, `migrated-lesson-${fallbackOrder}`)
  const isSeedLesson = /^lesson-\d+$/.test(lessonId)
  const ownerId = text(row.ownerId, isSeedLesson ? 'teacher-1' : text(row.teacherId, 'teacher-1'))
  const createdAt = text(row.createdAt, migrationTimestamp)
  const updatedAt = text(row.updatedAt, createdAt)
  const exercises = Array.isArray(row.exercises) ? row.exercises.map((exercise, index) => {
    const item = record(exercise)
    return {
      ...item,
      id: text(item.id, `${lessonId}-exercise-${index + 1}`),
      ownerId: text(item.ownerId, ownerId),
      status: item.status === 'draft' ? 'draft' : 'published',
      order: typeof item.order === 'number' ? item.order : index,
      createdAt: text(item.createdAt, createdAt),
      updatedAt: text(item.updatedAt, updatedAt),
    }
  }) : []
  const previousQuiz = record(row.quiz)
  const quiz = {
    ...previousQuiz,
    id: text(previousQuiz.id, `${lessonId}-quiz`),
    title: text(previousQuiz.title, 'Quiz'),
    ownerId: text(previousQuiz.ownerId, ownerId),
    status: previousQuiz.status === 'draft' ? 'draft' : 'published',
    order: typeof previousQuiz.order === 'number' ? previousQuiz.order : 0,
    createdAt: text(previousQuiz.createdAt, createdAt),
    updatedAt: text(previousQuiz.updatedAt, updatedAt),
    questions: Array.isArray(previousQuiz.questions) ? previousQuiz.questions : [],
  }
  return {
    ...row,
    id: lessonId,
    ownerId,
    teacherId: text(row.teacherId, ownerId),
    status: row.status === 'draft' ? 'draft' : 'published',
    order: typeof row.order === 'number' ? row.order : fallbackOrder,
    createdAt,
    updatedAt,
    videos: Array.isArray(row.videos) ? row.videos : [],
    exercises,
    quiz,
    ...(subjectId ? { subjectId } : {}),
    ...(chapterId ? { chapterId } : {}),
  }
}

function migrateContentValue(key: DataKey, value: unknown): unknown {
  if (key === 'lessons' && Array.isArray(value)) {
    return value.map((lesson, index) => migrateLesson(lesson, index))
  }
  if (key === 'subjects' && Array.isArray(value)) {
    return value.map((subject, subjectIndex) => {
      const row = record(subject)
      const subjectId = text(row.id, `migrated-subject-${subjectIndex + 1}`)
      const createdAt = text(row.createdAt, migrationTimestamp)
      const previousModules = Array.isArray(row.chapters) ? row.chapters : []
      const chapters = previousModules.map((module, moduleIndex) => {
        const item = record(module)
        const id = text(item.id, `${subjectId}-module-${moduleIndex + 1}`)
        const moduleCreatedAt = text(item.createdAt, createdAt)
        const oldLessons = Array.isArray(item.lessons) ? item.lessons : []
        const firstLesson = record(oldLessons[0])
        const seededModule = ['m1', 'm2', 'p1', 'p2'].includes(id)
        const ownerId = text(item.ownerId, seededModule ? 'teacher-1' : text(firstLesson.ownerId, text(firstLesson.teacherId, 'teacher-1')))
        const lessons = oldLessons.map((lesson, lessonIndex) => migrateLesson(lesson, lessonIndex, subjectId, id))
        return {
          ...item,
          id,
          title: text(item.title, `Module ${moduleIndex + 1}`),
          description: text(item.description, ''),
          ownerId,
          status: item.status === 'draft' ? 'draft' : 'published',
          order: typeof item.order === 'number' ? item.order : moduleIndex,
          createdAt: moduleCreatedAt,
          updatedAt: text(item.updatedAt, moduleCreatedAt),
          lessons,
        }
      })
      const title = text(row.titleFr, text(row.title, `Matière ${subjectIndex + 1}`))
      const rawSections = Array.isArray(row.sections) ? row.sections : []
      const sections = rawSections.filter((section): section is string => typeof section === 'string')
      return {
        ...row,
        id: subjectId,
        order: typeof row.order === 'number' ? row.order : subjectIndex,
        title,
        titleFr: title,
        description: text(row.description, ''),
        color: text(row.color, 'indigo'),
        icon: text(row.icon, 'book-open'),
        sections: sections.length > 0 ? sections : [subjectId === 'physics' ? 'Sciences expérimentales' : 'Mathématiques'],
        status: row.status === 'draft' ? 'draft' : 'published',
        ownerIds: Array.isArray(row.ownerIds) && row.ownerIds.every((owner) => typeof owner === 'string')
          ? row.ownerIds
          : ['teacher-1'],
        createdAt,
        updatedAt: text(row.updatedAt, createdAt),
        chapters,
      }
    })
  }
  if (key === 'exams' && Array.isArray(value)) {
    return value.map((exam, index) => {
      const row = record(exam)
      const ownerId = text(row.ownerId, text(row.teacherId, 'teacher-1'))
      const createdAt = text(row.createdAt, migrationTimestamp)
      return {
        ...row,
        id: text(row.id, `migrated-exam-${index + 1}`),
        ownerId,
        status: row.status === 'draft' ? 'draft' : 'published',
        order: typeof row.order === 'number' ? row.order : index,
        createdAt,
        updatedAt: text(row.updatedAt, createdAt),
      }
    })
  }
  return value
}

function migrateSettingsValue(value: unknown): unknown {
  const saved = record(value)
  return {
    ...saved,
    paymentsEnabled: saved.paymentsEnabled === true,
    pricingScope: saved.pricingScope === 'teacher' || saved.pricingScope === 'platform' ? saved.pricingScope : 'group',
    gracePeriodDays: typeof saved.gracePeriodDays === 'number' ? saved.gracePeriodDays : 7,
    subscriptionScope: saved.subscriptionScope === 'teacher' || saved.subscriptionScope === 'subject' ? saved.subscriptionScope : 'platform',
  }
}

const schemas: Partial<Record<keyof import('@/lib/data/provider').DataTables, z.ZodType>> = {
  accounts: z.array(z.object({ user: userSchema, passwordHash: z.string() })),
  lang: z.literal('fr'),
  subjects: z.array(subjectSchema),
  lessons: z.array(lessonSchema),
  lessonDrafts: z.array(z.object({
    lessonId: z.string().min(1),
    ownerId: z.string().min(1),
    updatedAt: z.string().datetime(),
    data: z.object({
      id: z.string().optional(),
      title: z.string(),
      duration: z.number(),
      videoUrl: z.string(),
      videos: z.array(videoSchema),
      summary: z.string(),
      pdfUrl: z.string(),
      exercises: z.array(z.object({ prompt: z.string(), correction: z.string() }).passthrough()),
      quiz: z.object({ id: z.string(), title: z.string(), questions: z.array(questionSchema) }).passthrough(),
      isFree: z.boolean(),
      teacherId: z.string().optional(),
      ownerId: z.string().optional(),
      subjectId: z.string().optional(),
      chapterId: z.string().optional(),
      status: z.enum(['draft', 'published']),
      order: z.number().int(),
    }).passthrough(),
  })),
  deletedLessons: z.array(z.string()),
  exams: z.array(z.object({
    ...ownedFields,
    id: z.string(), subjectId: z.string(), year: z.number(), session: z.string(),
    statement: z.string(), correction: z.string(), teacherId: z.string().optional(),
  })),
  contentTrash: z.array(z.discriminatedUnion('kind', [
    z.object({ id: z.string(), kind: z.literal('subject'), deletedAt: z.string().datetime(), subject: subjectSchema }),
    z.object({
      id: z.string(), kind: z.literal('module'), deletedAt: z.string().datetime(),
      subjectId: z.string(), module: subjectSchema.shape.chapters.element,
    }),
    z.object({
      id: z.string(), kind: z.literal('lesson'), deletedAt: z.string().datetime(),
      subjectId: z.string(), moduleId: z.string(), lesson: lessonSchema,
    }),
  ])),
  liveSessions: z.array(z.unknown()).refine((rows) => rows.every((row) =>
    liveSessionSchema.safeParse(row).success || isLegacyLiveSession(row))),
  liveQuestions: z.array(liveQuestionSchema),
  liveAttendance: z.array(liveAttendanceSchema),
  users: z.array(userSchema),
  user: userSchema.nullable(),
  quizMetrics: z.array(z.object({ lessonId: z.string(), score: z.number() })),
  payments: z.array(z.object({
    id: z.string(), userId: z.string(), userName: z.string(), phone: z.string(), plan: z.string(),
    amount: z.number(), submittedAt: z.string(), status: z.enum(['Pending', 'Approved', 'Rejected']),
    receipt: z.string(), receiptType: z.string(), rejectionReason: z.string().optional(),
  })),
  lessonViews: z.record(z.string(), z.number()),
  teacherAssignments: z.record(z.string(), z.array(z.string())),
  settings: z.object({
    monthlyPrice: z.number().positive(),
    paymentInstructions: z.string(),
    canCreateSubjects: z.boolean(),
    subscriptionScope: z.enum(['platform', 'teacher', 'subject']).optional(),
    paymentsEnabled: z.boolean().optional(),
    pricingScope: z.enum(['group', 'teacher', 'platform']).optional(),
    gracePeriodDays: z.number().int().min(0).max(90).optional(),
  }),
  notifications: z.array(z.object({
    id: z.string(), userId: z.string(), type: z.enum([
      'payment-approved', 'payment-rejected', 'live-starting', 'new-lesson', 'question-reply',
      'announcement', 'homework-graded', 'message-received', 'enrollment-request',
      'enrollment-accepted', 'enrollment-refused', 'slots-proposed', 'schedule-fixed',
      'session-rescheduled', 'session-cancelled', 'grade-published', 'group-payment',
    ]),
    title: z.string(), message: z.string(), href: z.string(), createdAt: z.string(), readAt: z.string().optional(),
  })),
  teacherProfiles: z.array(z.object({
    teacherId: z.string().min(1), photoUrl: z.string(), bio: z.string(), specialties: z.array(z.string()),
    subjectIds: z.array(z.string()), updatedAt: z.string(),
  })),
  teacherFollows: z.array(z.object({
    teacherId: z.string().min(1), studentId: z.string().min(1), followedAt: z.string(), lastVisitedAt: z.string(),
  })),
  lessonRatings: z.array(z.object({
    id: z.string().min(1), lessonId: z.string().min(1), teacherId: z.string().min(1), studentId: z.string().min(1),
    stars: z.number().int().min(1).max(5), comment: z.string(), createdAt: z.string(), updatedAt: z.string(),
    hidden: z.boolean().optional(),
  })),
  lessonQuestions: z.array(z.object({
    id: z.string().min(1), lessonId: z.string().min(1), teacherId: z.string().min(1), authorId: z.string().min(1),
    text: z.string(), videoPositionSeconds: z.number().nonnegative().optional(), createdAt: z.string(),
    answers: z.array(lessonAnswerSchema), voterIds: z.array(z.string()), answered: z.boolean(),
    pinnedAnswerId: z.string().optional(), hidden: z.boolean().optional(),
  })),
  homeworkAssignments: z.array(z.object({
    id: z.string().min(1), teacherId: z.string().min(1), groupId: z.string().optional(), lessonId: z.string().optional(), moduleId: z.string().optional(),
    title: z.string(), instructions: z.string(), dueAt: z.string(), maxPoints: z.number().positive(),
    allowedTypes: z.array(z.enum(['text', 'image', 'pdf'])), createdAt: z.string(),
  })),
  homeworkSubmissions: z.array(z.object({
    id: z.string().min(1), assignmentId: z.string().min(1), studentId: z.string().min(1),
    text: z.string().optional(), file: homeworkFileSchema.optional(), submittedAt: z.string(), late: z.boolean(),
    grade: z.number().nonnegative().optional(), feedback: z.string().optional(), correctedFile: homeworkFileSchema.optional(),
    correctedAt: z.string().optional(),
  })),
  teacherAnnouncements: z.array(z.object({
    id: z.string().min(1), teacherId: z.string().min(1), title: z.string(), body: z.string(),
    audience: z.discriminatedUnion('type', [
      z.object({ type: z.literal('followers') }),
      z.object({ type: z.literal('subject'), subjectId: z.string().min(1) }),
    ]),
    pinned: z.boolean(), createdAt: z.string(),
  })),
  privateMessages: z.array(z.object({
    id: z.string().min(1), conversationId: z.string().min(1), senderId: z.string().min(1),
    recipientId: z.string().min(1), text: z.string(), createdAt: z.string(), readAt: z.string().optional(),
    flagged: z.boolean(), hidden: z.boolean().optional(),
  })),
  messagingBlocks: z.array(z.object({
    studentId: z.string().min(1), teacherId: z.string().min(1), createdAt: z.string(),
  })),
  reports: z.array(z.object({
    id: z.string().min(1), reporterId: z.string().min(1),
    targetType: z.enum(['comment', 'question', 'review', 'message', 'answer', 'announcement']),
    targetId: z.string().min(1), reason: z.string().min(1), createdAt: z.string(),
    status: z.enum(['pending', 'resolved']),
  })),
  moderationActions: z.array(z.object({
    id: z.string().min(1), reportId: z.string().min(1), adminId: z.string().min(1),
    action: z.enum(['hide', 'delete', 'warn', 'block-messaging', 'suspend']), note: z.string(), createdAt: z.string(),
  })),
  relationshipSettings: z.object({
    messagingEnabled: z.boolean(), messagesPerHour: z.number().int().min(1).max(1000),
    bannedWords: z.array(z.string()), disabledMessagingUserIds: z.array(z.string()),
  }),
  teacherEngagement: z.array(z.object({
    teacherId: z.string().min(1), month: z.string().regex(/^\d{4}-\d{2}$/),
    videoMinutesWatched: z.number().nonnegative(), lessonsCompleted: z.number().nonnegative(),
    activeStudents: z.number().nonnegative(), revenueSharePercentage: z.number().min(0).max(100),
  })),
  studentActivity: z.array(z.object({
    studentId: z.string().min(1), teacherId: z.string().min(1), lessonId: z.string().min(1),
    type: z.enum(['video', 'lesson-completed', 'quiz']), occurredAt: z.string(),
  })),
  subjectEnrollments: z.array(z.object({
    studentId: z.string().min(1), subjectId: z.string().min(1), enrolledAt: z.string(),
  })),
  sections: z.array(z.object({
    id: z.string().min(1), name: z.string().trim().min(1), order: z.number().int(), active: z.boolean(),
  })),
  classGroups: z.array(z.object({
    id: z.string().min(1), name: z.string().trim().min(1), sectionId: z.string().min(1),
    subjectId: z.string().min(1), teacherId: z.string().min(1), maxStudents: z.number().int().positive(),
    description: z.string(), monthlyPrice: z.number().nonnegative().nullable(),
    status: z.enum(['ouvert aux inscriptions', 'complet', 'fermé']),
    scheduleStatus: z.enum(['en attente', 'proposé', 'fixé']), createdAt: z.string(),
  })),
  groupEnrollments: z.array(z.object({
    id: z.string().min(1), studentId: z.string().min(1), groupId: z.string().min(1),
    status: z.enum(['en attente', 'accepté', 'refusé', 'retiré']), requestedAt: z.string(),
    decidedAt: z.string().optional(), decisionReason: z.string().optional(), leftAt: z.string().optional(),
  })),
  groupContentLinks: z.array(z.object({
    id: z.string().min(1), groupId: z.string().min(1), moduleId: z.string().min(1),
    lessonIds: z.array(z.string()), order: z.number().int(), published: z.boolean(),
  })),
  schedulePolls: z.array(z.object({
    id: z.string().min(1), groupId: z.string().min(1), teacherId: z.string().min(1),
    slots: z.array(z.object({
      id: z.string().min(1), dayOfWeek: z.number().int().min(0).max(6),
      startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
      durationMinutes: z.number().int().min(15).max(240),
    })),
    deadlineAt: z.string(), status: z.enum(['ouvert', 'fixé', 'expiré']),
    selectedSlotIds: z.array(z.string()), weeks: z.number().int().min(1).max(52), createdAt: z.string(),
  })),
  schedulePollVotes: z.array(z.object({
    pollId: z.string().min(1), slotId: z.string().min(1), studentId: z.string().min(1),
    vote: z.enum(['Disponible', 'Si nécessaire', 'Indisponible']), updatedAt: z.string(),
  })),
  groupRescheduleRequests: z.array(z.object({
    id: z.string().min(1), groupId: z.string().min(1), sessionId: z.string().optional(),
    requesterId: z.string().min(1), proposedDate: z.string().optional(), proposedStartTime: z.string().optional(),
    reason: z.string().trim().min(1), status: z.enum(['en attente', 'accepté', 'refusé']), createdAt: z.string(),
  })),
  groupAttendance: z.array(z.object({
    groupId: z.string().min(1), sessionId: z.string().min(1), studentId: z.string().min(1),
    status: z.enum(['présent', 'absent', 'retard', 'absent justifié']), markedAt: z.string(),
  })),
  classLogEntries: z.array(z.object({
    id: z.string().min(1), groupId: z.string().min(1), sessionId: z.string().min(1),
    teacherId: z.string().min(1), coveredLessonIds: z.array(z.string()), summary: z.string(), createdAt: z.string(),
  })),
  groupAssessments: z.array(z.object({
    id: z.string().min(1), groupId: z.string().min(1), teacherId: z.string().min(1),
    title: z.string().trim().min(1), type: z.enum(['devoir', 'oral', 'TP', 'quiz']), date: z.string(),
    maxPoints: z.number().positive().max(1000), coefficient: z.number().positive().max(100),
    createdAt: z.string(), published: z.boolean(),
  })),
  studentGrades: z.array(z.object({
    id: z.string().min(1), assessmentId: z.string().min(1), studentId: z.string().min(1),
    score: z.number().nonnegative().optional(), absent: z.boolean(), updatedAt: z.string(),
  })),
  gradeAuditLog: z.array(z.object({
    id: z.string().min(1), gradeId: z.string().min(1), teacherId: z.string().min(1),
    previousScore: z.number().optional(), nextScore: z.number().optional(),
    reason: z.string().trim().min(1), createdAt: z.string(),
  })),
  groupPayments: z.array(z.object({
    id: z.string().min(1), groupId: z.string().min(1), studentId: z.string().min(1),
    period: z.string().regex(/^\d{4}-\d{2}$/), status: z.enum(['payé', 'en attente', 'en retard']),
    receipt: z.string().optional(), submittedAt: z.string(), decidedAt: z.string().optional(),
  })),
  groupAnnouncements: z.array(z.object({
    id: z.string().min(1), groupId: z.string().min(1), teacherId: z.string().min(1),
    title: z.string().trim().min(1), body: z.string(), pinned: z.boolean(), createdAt: z.string(), hidden: z.boolean().optional(),
  })),
  theme: z.enum(['light', 'dark']),
}

function isValidValue(key: DataKey, value: unknown): boolean {
  if (key in schemas) return schemas[key as keyof typeof schemas]?.safeParse(value).success === true
  if (key.startsWith('completed:')) return Array.isArray(value) && value.every((item) => typeof item === 'string')
  if (key.startsWith('lastViewed:')) return value === null || typeof value === 'string'
  if (key.startsWith('quizResults:')) {
    return z.array(z.object({
      id: z.string(), lessonId: z.string(), title: z.string(), score: z.number(),
      date: z.string(), answers: z.array(z.number()),
    })).safeParse(value).success
  }
  if (key.startsWith('subscription:')) {
    return z.object({
      status: z.enum(['None', 'Pending', 'Active', 'Expired']),
      plan: z.string().optional(),
      expiresAt: z.string().optional(),
      scope: z.enum(['platform', 'teacher', 'subject']).optional(),
    }).safeParse(value).success
  }
  if (key.startsWith('videoPosition:')) {
    return z.object({
      videoId: z.string().min(1),
      seconds: z.number().nonnegative(),
      updatedAt: z.string().datetime(),
    }).safeParse(value).success
  }
  return false
}

function defaultValue(key: DataKey): unknown {
  if (key === 'subjects') return subjects
  if (key === 'users') return demoUsers
  if (key === 'sections') return demoSections
  if (key === 'classGroups') return demoGroups
  if (key === 'groupEnrollments') return demoGroupEnrollments
  if (key === 'groupContentLinks') return demoGroupContentLinks
  if (key === 'schedulePolls') return demoSchedulePolls
  if (key === 'schedulePollVotes') return demoSchedulePollVotes
  if (key === 'groupRescheduleRequests') return demoGroupRescheduleRequests
  if (key === 'groupAttendance') return demoGroupAttendance
  if (key === 'classLogEntries') return demoClassLogEntries
  if (key === 'groupAssessments') return demoGroupAssessments
  if (key === 'studentGrades') return demoStudentGrades
  if (key === 'gradeAuditLog') return demoGradeAuditLog
  if (key === 'groupPayments') return demoGroupPayments
  if (key === 'groupAnnouncements') return demoGroupAnnouncements
  if (key === 'liveSessions') return demoLiveSessions
  if (key === 'accounts') return []
  if (key === 'lang') return 'fr'
  if (key === 'theme') return 'light'
  if (key === 'user') return null
  if (key === 'settings') return { monthlyPrice: 12, paymentInstructions: 'D17: 22 000 000\nFlouci: 55 000 000', canCreateSubjects: true, subscriptionScope: 'platform', paymentsEnabled: false, pricingScope: 'group', gracePeriodDays: 7 }
  if (key === 'contentTrash') return []
  if (key === 'lessonDrafts') return []
  if (key === 'lessonViews') return {}
  if (key === 'teacherAssignments') return { 'teacher-1': ['math', 'physics'], 'teacher-2': ['math', 'physics'], 'teacher-3': ['physics'] }
  if (key === 'relationshipSettings') return { messagingEnabled: true, messagesPerHour: 10, bannedWords: [], disabledMessagingUserIds: [] }
  if (key.startsWith('completed:') || key.startsWith('quizResults:')) return []
  if (key.startsWith('lastViewed:')) return null
  if (key.startsWith('subscription:')) return { status: 'None', scope: 'platform' }
  if (key.startsWith('videoPosition:')) return null
  return []
}

function storageKey(key: DataKey): string {
  if (key === 'subjects' || key === 'lessons' || key === 'exams' || key === 'deletedLessons' || key === 'contentTrash') {
    return `edubac:v2:${key}`
  }
  if (key === 'settings' || key === 'liveSessions' || key === 'sections' || key === 'classGroups'
    || key === 'groupEnrollments' || key === 'groupContentLinks' || key === 'schedulePolls'
    || key === 'schedulePollVotes' || key === 'groupRescheduleRequests' || key === 'groupAttendance'
    || key === 'classLogEntries' || key === 'groupAssessments' || key === 'studentGrades'
    || key === 'gradeAuditLog' || key === 'groupPayments' || key === 'groupAnnouncements') {
    return `edubac:v3:${key}`
  }
  return `edubac:${key}`
}

function legacyStorageKey(key: DataKey): string {
  return `edubac:${key}`
}

export const localProvider: DataProvider = {
  async read<K extends DataKey>(key: K): Promise<DataResult<DataValue<K>>> {
    if (typeof window === 'undefined') return { ok: true, data: defaultValue(key) as DataValue<K> }
    try {
      const currentKey = storageKey(key)
      let saved = window.localStorage.getItem(currentKey)
      const isVersionedData = currentKey.startsWith('edubac:v2:') || currentKey.startsWith('edubac:v3:')
      const isVersionedContent = currentKey.startsWith('edubac:v2:')
      const legacySaved = saved === null && isVersionedData
        ? window.localStorage.getItem(legacyStorageKey(key))
        : null
      if (saved === null) saved = legacySaved
      const shouldMigrate = legacySaved !== null
      const rawValue: unknown = saved === null ? defaultValue(key) : JSON.parse(saved)
      const value = key === 'settings' ? migrateSettingsValue(rawValue)
        : isVersionedContent ? migrateContentValue(key, rawValue) : rawValue
      if (!isValidValue(key, value)) {
        return { ok: false, error: { code: 'invalid-data', message: `Les données locales « ${String(key)} » sont invalides.` } }
      }
      if (shouldMigrate) window.localStorage.setItem(currentKey, JSON.stringify(value))
      return { ok: true, data: value as DataValue<K> }
    } catch {
      return {
        ok: false,
        error: {
          code: 'invalid-data',
          message: `Impossible de lire les données locales « ${String(key)} ».`,
        },
      }
    }
  },

  async write<K extends DataKey>(key: K, value: DataValue<K>): Promise<DataResult<void>> {
    if (typeof window === 'undefined') {
      return { ok: false, error: { code: 'storage-unavailable', message: 'Le stockage local est indisponible.' } }
    }
    try {
      window.localStorage.setItem(storageKey(key), JSON.stringify(value))
      return { ok: true, data: undefined }
    } catch {
      return {
        ok: false,
        error: {
          code: 'persistence-failed',
          message: `Impossible d’enregistrer les données locales « ${String(key)} ».`,
        },
      }
    }
  },

  async reset(): Promise<DataResult<void>> {
    if (typeof window === 'undefined') {
      return { ok: false, error: { code: 'storage-unavailable', message: 'Le stockage local est indisponible.' } }
    }
    try {
      const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
        .filter((key): key is string => key?.startsWith('edubac:') === true)
      for (const key of keys) window.localStorage.removeItem(key)
      return { ok: true, data: undefined }
    } catch {
      return { ok: false, error: { code: 'reset-failed', message: 'Impossible de réinitialiser les données de démonstration.' } }
    }
  },
}

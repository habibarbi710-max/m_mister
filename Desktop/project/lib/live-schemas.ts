import { z } from 'zod'

const webUrlSchema = z.string().url().refine((value) => {
  try {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}, 'URL invalide')

export const liveResourceSchema = z.object({
  title: z.string().trim().min(1).max(120),
  url: webUrlSchema,
})

const liveSessionBaseSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000),
  subjectId: z.string().min(1),
  groupId: z.string().min(1).optional(),
  teacherId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  }),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: z.number().int().min(15).max(240),
  provider: z.enum(['livekit', 'external']),
  externalUrl: webUrlSchema.optional(),
  status: z.enum(['scheduled', 'live', 'ended', 'cancelled']),
  replayUrl: webUrlSchema.optional(),
  changeReason: z.string().max(1000).optional(),
  resources: z.array(liveResourceSchema).max(30),
  createdAt: z.string().datetime(),
})

function validateProviderUrl(
  session: Pick<z.infer<typeof liveSessionBaseSchema>, 'provider' | 'externalUrl'>,
  context: z.RefinementCtx,
) {
  if (session.provider === 'external' && !session.externalUrl) {
    context.addIssue({ code: 'custom', path: ['externalUrl'], message: 'Un lien de séance est requis' })
  }
  if (session.provider === 'livekit' && session.externalUrl) {
    context.addIssue({ code: 'custom', path: ['externalUrl'], message: 'Le lien externe ne s’applique pas à une salle LiveKit' })
  }
}

export const liveSessionSchema = liveSessionBaseSchema.superRefine(validateProviderUrl)

export const liveSessionInputSchema = liveSessionBaseSchema.omit({
  id: true,
  teacherId: true,
  status: true,
  createdAt: true,
}).superRefine(validateProviderUrl).superRefine((session, context) => {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Tunis',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  if (session.date < today) {
    context.addIssue({ code: 'custom', path: ['date'], message: 'La date ne peut pas être passée' })
  }
})

export const liveQuestionSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  studentId: z.string().min(1),
  text: z.string().trim().min(2).max(500),
  createdAt: z.string().datetime(),
  voterIds: z.array(z.string().min(1)),
  answered: z.boolean(),
})

export const liveAttendanceSchema = z.object({
  sessionId: z.string().min(1),
  studentId: z.string().min(1),
  joinedAt: z.string().datetime(),
})

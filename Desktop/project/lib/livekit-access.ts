import { z } from 'zod'
import { liveSessionSchema } from '@/lib/live-schemas'
import type { LiveSession } from '@/types'
import { MAX_STUDENTS_PER_SESSION } from '@/lib/livekit-config'
import { liveSessionStart } from '@/lib/live-time'

export const livekitCallerSchema = z.object({
  id: z.string().min(1).max(128),
  displayName: z.string().trim().min(1).max(120),
  role: z.enum(['student', 'teacher', 'admin']),
  subscriptionActive: z.boolean(),
})

export const livekitAccessRequestSchema = z.object({
  session: liveSessionSchema,
  caller: livekitCallerSchema,
})

export type LivekitCaller = z.infer<typeof livekitCallerSchema>
export type LivekitAccessRequest = { session: LiveSession; caller: LivekitCaller }

export type LivekitAccessDecision =
  | { ok: true; roomName: string; identity: string; canPublish: boolean; canPublishData: boolean }
  | { ok: false; status: number; error: string }

export function roomNameForSession(sessionId: string): string {
  return `learn-with-me-${sessionId}`
}

export function verifyLiveAccess(
  input: LivekitAccessRequest,
  currentStudentCount: number,
): LivekitAccessDecision {
  // The caller and subscription claims come from localStorage in this prototype. Production must
  // replace this check with a verified server session and a database-backed role/subscription lookup.
  if (process.env.NODE_ENV === 'production') {
    return { ok: false, status: 503, error: 'L’authentification sécurisée du live n’est pas configurée.' }
  }
  const parsed = livekitAccessRequestSchema.safeParse(input)
  if (!parsed.success) return { ok: false, status: 400, error: 'Les informations de connexion sont invalides.' }
  const { session, caller } = parsed.data
  if (caller.role === 'admin') return { ok: false, status: 403, error: 'Les administrateurs ne peuvent pas rejoindre cette salle.' }
  if (session.status === 'cancelled' || session.status === 'ended') return { ok: false, status: 410, error: 'Cette séance est terminée ou annulée.' }
  const startsAt = liveSessionStart(session).getTime()
  const now = Date.now()
  if (now < startsAt - 15 * 60_000 || now > startsAt + session.durationMinutes * 60_000) {
    return { ok: false, status: 403, error: 'La salle ouvre 15 minutes avant le début de la séance.' }
  }
  if (caller.role === 'teacher') {
    if (caller.id !== session.teacherId) return { ok: false, status: 403, error: 'Seul l’enseignant de cette séance peut la démarrer.' }
    return {
      ok: true,
      roomName: roomNameForSession(session.id),
      identity: caller.id,
      canPublish: true,
      canPublishData: true,
    }
  }
  if (!caller.subscriptionActive) return { ok: false, status: 403, error: 'Un abonnement actif est nécessaire pour rejoindre le direct.' }
  if (currentStudentCount >= MAX_STUDENTS_PER_SESSION) return { ok: false, status: 409, error: 'Salle complète' }
  return {
    ok: true,
    roomName: roomNameForSession(session.id),
    identity: caller.id,
    canPublish: false,
    canPublishData: true,
  }
}

export function validateTeacherCaller(caller: LivekitCaller, session: LiveSession): string | undefined {
  if (caller.role !== 'teacher' || caller.id !== session.teacherId) {
    return 'Seul l’enseignant propriétaire peut gérer les permissions de cette salle.'
  }
  return undefined
}

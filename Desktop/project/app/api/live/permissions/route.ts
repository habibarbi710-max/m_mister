import { RoomServiceClient, TrackSource } from 'livekit-server-sdk'
import { z } from 'zod'
import { livekitAccessRequestSchema, roomNameForSession, validateTeacherCaller } from '@/lib/livekit-access'

const permissionRequestSchema = livekitAccessRequestSchema.extend({
  targetIdentity: z.string().min(1).max(128),
  grant: z.boolean(),
})

function liveKitConfiguration() {
  const url = process.env.LIVEKIT_URL
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!url || !apiKey || !apiSecret) return undefined
  return { url: url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'), apiKey, apiSecret }
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Corps de requête JSON invalide.' }, { status: 400 })
  }
  const parsed = permissionRequestSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'Les informations de permission sont invalides.' }, { status: 400 })
  const { session, caller, targetIdentity, grant } = parsed.data
  const denied = validateTeacherCaller(caller, session)
  if (denied) return Response.json({ error: denied }, { status: 403 })
  if (session.provider !== 'livekit' || session.status !== 'live') {
    return Response.json({ error: 'Le direct doit être en cours pour gérer la prise de parole.' }, { status: 409 })
  }
  if (targetIdentity === session.teacherId) return Response.json({ error: 'L’enseignant ne peut pas se donner cette permission.' }, { status: 400 })
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'L’authentification sécurisée du live n’est pas configurée.' }, { status: 503 })
  }
  const config = liveKitConfiguration()
  if (!config) return Response.json({ error: 'La salle vidéo n’est pas configurée.' }, { status: 503 })
  const roomService = new RoomServiceClient(config.url, config.apiKey, config.apiSecret)
  try {
    const roomName = roomNameForSession(session.id)
    const participants = await roomService.listParticipants(roomName)
    const target = participants.find((participant) => participant.identity === targetIdentity)
    if (!target) return Response.json({ error: 'Cet élève n’est plus dans la salle.' }, { status: 404 })
    const currentlySpeaking = participants.find((participant) => {
      if (participant.identity === targetIdentity || participant.identity === session.teacherId || !participant.permission?.canPublish) return false
      try {
        return JSON.parse(participant.metadata || '{}').role === 'student'
      } catch {
        return false
      }
    })
    if (grant && currentlySpeaking) return Response.json({ error: 'Un seul élève peut prendre la parole à la fois.' }, { status: 409 })
    await roomService.updateParticipant(roomName, targetIdentity, {
      permission: {
        canSubscribe: true,
        canPublish: grant,
        canPublishSources: grant ? [TrackSource.MICROPHONE] : [],
        canPublishData: true,
      },
    })
    return Response.json({ granted: grant, targetIdentity })
  } catch (error) {
    console.error('LiveKit participant permission update failed', error)
    return Response.json({ error: 'Impossible de modifier la permission de cet élève.' }, { status: 502 })
  }
}

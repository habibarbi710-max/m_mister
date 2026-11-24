import { RoomServiceClient, TrackSource } from 'livekit-server-sdk'
import { z } from 'zod'
import { livekitAccessRequestSchema, roomNameForSession, validateTeacherCaller } from '@/lib/livekit-access'
import { getAuthenticatedProfile, getServerLiveSession } from '@/lib/supabase/authz'

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
  const authContext = await getAuthenticatedProfile()
  if (!authContext) return Response.json({ error: 'Vous devez être connecté.' }, { status: 401 })
  const serverSession = await getServerLiveSession(session.id)
  if (!serverSession) return Response.json({ error: 'Cette séance est introuvable.' }, { status: 404 })
  if (caller.id !== authContext.userId || caller.role !== authContext.profile.role) {
    return Response.json({ error: 'L’identité du participant est invalide.' }, { status: 403 })
  }
  const denied = validateTeacherCaller(caller, serverSession)
  if (denied) return Response.json({ error: denied }, { status: 403 })
  if (serverSession.provider !== 'livekit' || serverSession.status !== 'live') {
    return Response.json({ error: 'Le direct doit être en cours pour gérer la prise de parole.' }, { status: 409 })
  }
  if (targetIdentity === session.teacherId) return Response.json({ error: 'L’enseignant ne peut pas se donner cette permission.' }, { status: 400 })
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

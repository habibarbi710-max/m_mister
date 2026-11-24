import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk'
import { livekitAccessRequestSchema, roomNameForSession, verifyLiveAccess } from '@/lib/livekit-access'
import { MAX_STUDENTS_PER_SESSION } from '@/lib/livekit-config'
import { getAuthenticatedProfile, getServerLiveSession, getServerSubscription } from '@/lib/supabase/authz'

function liveKitConfiguration() {
  const url = process.env.LIVEKIT_URL
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  const publicUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || url
  if (!url || !apiKey || !apiSecret || !publicUrl) return undefined
  return { url, publicUrl, apiKey, apiSecret }
}

function apiUrl(url: string): string {
  return url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:')
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Corps de requête JSON invalide.' }, { status: 400 })
  }
  const parsed = livekitAccessRequestSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'Les informations de connexion sont invalides.' }, { status: 400 })
  const config = liveKitConfiguration()
  if (!config) return Response.json({ error: 'La salle vidéo n’est pas configurée. Ajoutez les variables LiveKit au fichier .env.local.' }, { status: 503 })

  const { session, caller } = parsed.data
  const authContext = await getAuthenticatedProfile()
  if (!authContext) return Response.json({ error: 'Vous devez être connecté.' }, { status: 401 })
  const serverSession = await getServerLiveSession(session.id)
  if (!serverSession) return Response.json({ error: 'Cette séance est introuvable.' }, { status: 404 })
  if (caller.id !== authContext.userId) return Response.json({ error: 'L’identité du participant est invalide.' }, { status: 403 })
  if (caller.role !== authContext.profile.role) return Response.json({ error: 'Le rôle du participant est invalide.' }, { status: 403 })

  let subscriptionActive = false
  if (authContext.profile.role === 'student') {
    const subscription = await getServerSubscription(authContext.userId)
    subscriptionActive = subscription?.status === 'Active'
  }
  const verifiedCaller = {
    ...caller,
    displayName: authContext.profile.name,
    subscriptionActive,
  }
  const verifiedInput = { session: serverSession, caller: verifiedCaller }
  const roomName = roomNameForSession(session.id)
  const initialDecision = verifyLiveAccess(verifiedInput, 0)
  if (!initialDecision.ok) return Response.json({ error: initialDecision.error }, { status: initialDecision.status })
  const roomService = new RoomServiceClient(apiUrl(config.url), config.apiKey, config.apiSecret)
  try {
    const rooms = await roomService.listRooms([roomName])
    if (rooms.length === 0) {
      await roomService.createRoom({ name: roomName, maxParticipants: MAX_STUDENTS_PER_SESSION + 1 })
    }
    const participants = await roomService.listParticipants(roomName)
    const alreadyPresent = participants.some((participant) => participant.identity === caller.id)
    const currentStudents = participants.filter((participant) => participant.identity !== session.teacherId).length
    const decision = verifyLiveAccess(verifiedInput, alreadyPresent ? Math.max(0, currentStudents - 1) : currentStudents)
    if (!decision.ok) return Response.json({ error: decision.error }, { status: decision.status })

    const token = new AccessToken(config.apiKey, config.apiSecret, {
      identity: decision.identity,
      name: caller.displayName,
      ttl: '2h',
      metadata: JSON.stringify({ role: caller.role, sessionId: session.id }),
    })
    token.addGrant({
      roomJoin: true,
      room: decision.roomName,
      canSubscribe: true,
      canPublish: decision.canPublish,
      canPublishSources: decision.canPublish
        ? [TrackSource.CAMERA, TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE]
        : [],
      canPublishData: decision.canPublishData,
    })
    return Response.json({ token: await token.toJwt(), serverUrl: config.publicUrl, roomName })
  } catch (error) {
    console.error('LiveKit token creation failed', error)
    return Response.json({ error: 'Impossible de préparer la salle LiveKit. Vérifiez la configuration du serveur.' }, { status: 502 })
  }
}

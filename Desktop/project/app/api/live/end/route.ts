import { RoomServiceClient } from 'livekit-server-sdk'
import { livekitAccessRequestSchema, roomNameForSession } from '@/lib/livekit-access'

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
  const parsed = livekitAccessRequestSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'Les informations de connexion sont invalides.' }, { status: 400 })
  const { session, caller } = parsed.data
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'L’authentification sécurisée du live n’est pas configurée.' }, { status: 503 })
  }
  if (caller.role !== 'admin' && (caller.role !== 'teacher' || caller.id !== session.teacherId)) {
    return Response.json({ error: 'Seul l’enseignant propriétaire ou un administrateur peut terminer cette salle.' }, { status: 403 })
  }
  if (session.provider !== 'livekit' || session.status !== 'live') {
    return Response.json({ error: 'Seul un direct LiveKit en cours peut être terminé.' }, { status: 409 })
  }
  const config = liveKitConfiguration()
  if (!config) return Response.json({ error: 'La salle vidéo n’est pas configurée.' }, { status: 503 })
  try {
    const roomService = new RoomServiceClient(config.url, config.apiKey, config.apiSecret)
    const roomName = roomNameForSession(session.id)
    const rooms = await roomService.listRooms([roomName])
    if (rooms.length) await roomService.deleteRoom(roomName)
    return Response.json({ ended: true })
  } catch (error) {
    console.error('LiveKit room termination failed', error)
    return Response.json({ error: 'Impossible de déconnecter les participants de la salle.' }, { status: 502 })
  }
}

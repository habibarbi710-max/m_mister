import type { LiveSession, User } from '@/types'

export async function terminateLiveKitRoom(
  session: LiveSession,
  caller: Pick<User, 'id' | 'name' | 'role'>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch('/api/live/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session,
        caller: {
          id: caller.id,
          displayName: caller.name,
          role: caller.role,
          subscriptionActive: false,
        },
      }),
    })
    let result: { error?: string }
    try {
      result = await response.json() as { error?: string }
    } catch {
      return { ok: false, error: 'Le serveur a renvoyé une réponse invalide.' }
    }
    if (!response.ok) return { ok: false, error: result.error || 'Impossible de terminer la salle LiveKit.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Impossible de contacter le serveur pour terminer la salle LiveKit.' }
  }
}

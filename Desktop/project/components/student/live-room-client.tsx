'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useRoomContext,
  useConnectionState,
  useParticipants,
  useTracks,
} from '@livekit/components-react'
import { ConnectionState, RoomEvent, Track } from 'livekit-client'
import { Camera, CameraOff, Hand, Mic, MicOff, Radio, ScreenShare, ScreenShareOff, Users } from 'lucide-react'
import { toast } from 'sonner'
import * as api from '@/lib/api'
import { useLanguage } from '@/components/shared/language-provider'
import type { LiveSession, User } from '@/types'

type TokenResponse = { token: string; serverUrl: string; roomName: string }
type RaisedHand = { identity: string; name: string }

export function LiveRoomClient({ session, user, active }: { session: LiveSession; user: User; active: boolean }) {
  const { t } = useLanguage()
  const [token, setToken] = useState<TokenResponse>()
  const [error, setError] = useState('')
  const [deviceError, setDeviceError] = useState('')
  const [loading, setLoading] = useState(true)
  const connectedAttendance = useRef(false)
  const caller = useMemo(() => ({
    id: user.id,
    displayName: user.name,
    role: user.role,
    subscriptionActive: active,
  }), [active, user.id, user.name, user.role])

  useEffect(() => {
    let mounted = true
    async function fetchToken() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch('/api/live/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session, caller }),
        })
        const payload = await response.json() as TokenResponse | { error?: string }
        if (!response.ok || !('token' in payload)) {
          throw new Error('error' in payload && payload.error ? payload.error : 'Impossible de rejoindre la salle.')
        }
        if (mounted) setToken(payload)
      } catch (requestError) {
        if (mounted) setError(requestError instanceof Error ? requestError.message : 'Impossible de rejoindre la salle.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    void fetchToken()
    return () => { mounted = false }
  }, [caller, session])

  const onConnected = useCallback(() => {
    if (user.role === 'student' && session.status === 'live' && !connectedAttendance.current) {
      connectedAttendance.current = true
      void api.recordLiveAttendance(session.id).then((result) => {
        if (!result.ok) toast.error(result.error)
      }).catch(() => toast.error(t('unknownError')))
    }
  }, [session.id, session.status, t, user.role])

  const onDeviceFailure = useCallback((_failure?: unknown) => {
    setDeviceError('Autorisez l’accès au microphone ou à la caméra dans les paramètres de votre navigateur, puis rechargez la page.')
  }, [])

  if (typeof window !== 'undefined' && !('RTCPeerConnection' in window)) {
    return <p className="live-room-alert" role="alert">Ce navigateur ne prend pas en charge les salles vidéo. Essayez une version récente de Chrome, Edge, Firefox ou Safari.</p>
  }
  if (loading) return <div className="live-room-loading" role="status"><span className="skeleton-video"/><p>{t('loading')}</p></div>
  if (error) return <div className="live-room-alert" role="alert"><p>{error}</p><button className="button-soft" type="button" onClick={() => window.location.reload()}>Réessayer</button></div>
  if (!token) return <p className="live-room-alert" role="alert">La salle n’a pas pu être préparée.</p>

  return <div className="live-room-video">
    {deviceError && <p className="live-room-alert" role="alert">{deviceError}</p>}
    <LiveKitRoom
      serverUrl={token.serverUrl}
      token={token.token}
      connect
      audio={false}
      video={false}
      screen={false}
      onConnected={onConnected}
      onDisconnected={() => setDeviceError('La connexion à cette salle a été interrompue. Vérifiez votre connexion ou rechargez la page pour réessayer.')}
      onError={(roomError) => setDeviceError(roomError.name === 'NotAllowedError'
        ? 'Autorisez l’accès au microphone et à la caméra dans les paramètres de votre navigateur.'
        : 'La connexion à la salle a échoué. Vérifiez votre connexion puis réessayez.')}
      onMediaDeviceFailure={onDeviceFailure}
      className="livekit-room-root"
    >
      <RoomAudioRenderer/>
      {session.status === 'scheduled' && <p className="live-room-waiting" role="status">Le live n’a pas encore commencé. Vous êtes dans la salle d’attente.</p>}
      <RoomConnectionNotice/>
      <RoomMedia session={session} caller={caller} setDeviceError={setDeviceError}/>
    </LiveKitRoom>
  </div>
}

function RoomConnectionNotice() {
  const state = useConnectionState()
  if (state !== ConnectionState.Reconnecting && state !== ConnectionState.Connecting) return null
  return <p className="live-room-reconnecting" role="status">Connexion interrompue. Reconnexion automatique en cours…</p>
}

function RoomMedia({
  session,
  caller,
  setDeviceError,
}: {
  session: LiveSession
  caller: { id: string; displayName: string; role: User['role']; subscriptionActive: boolean }
  setDeviceError: (message: string) => void
}) {
  const { t } = useLanguage()
  const room = useRoomContext()
  const participants = useParticipants()
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: true },
  ])
  const [microphoneOn, setMicrophoneOn] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)
  const [screenOn, setScreenOn] = useState(false)
  const [microphoneGranted, setMicrophoneGranted] = useState(caller.role === 'teacher')
  const [handRaised, setHandRaised] = useState(false)
  const [raisedHands, setRaisedHands] = useState<RaisedHand[]>([])
  const [granting, setGranting] = useState('')

  useEffect(() => {
    const updatePermission = () => setMicrophoneGranted(Boolean(room.localParticipant.permissions?.canPublish))
    updatePermission()
    room.on(RoomEvent.ParticipantPermissionsChanged, updatePermission)
    return () => { room.off(RoomEvent.ParticipantPermissionsChanged, updatePermission) }
  }, [room])

  useEffect(() => {
    if (caller.role !== 'teacher') return
    const receive = (payload: Uint8Array, participant?: { identity: string; name?: string }, _kind?: unknown, topic?: string) => {
      if (topic !== 'hand-raise' || !participant) return
      let message: { type?: string }
      try {
        message = JSON.parse(new TextDecoder().decode(payload)) as { type?: string }
      } catch {
        return
      }
      setRaisedHands((current) => message.type === 'hand-raise'
        ? [...current.filter((hand) => hand.identity !== participant.identity), { identity: participant.identity, name: participant.name || 'Élève' }]
        : current.filter((hand) => hand.identity !== participant.identity))
    }
    room.on(RoomEvent.DataReceived, receive)
    return () => { room.off(RoomEvent.DataReceived, receive) }
  }, [caller.role, room])

  const updateDevice = async (device: 'microphone' | 'camera' | 'screen') => {
    try {
      if (device === 'microphone') {
        const next = !microphoneOn
        await room.localParticipant.setMicrophoneEnabled(next)
        setMicrophoneOn(next)
      } else if (device === 'camera') {
        const next = !cameraOn
        await room.localParticipant.setCameraEnabled(next)
        setCameraOn(next)
      } else {
        const next = !screenOn
        await room.localParticipant.setScreenShareEnabled(next)
        setScreenOn(next)
      }
      setDeviceError('')
    } catch (error) {
      setDeviceError(error instanceof Error && error.name === 'NotAllowedError'
        ? 'Autorisez l’accès au microphone ou à la caméra dans les paramètres de votre navigateur.'
        : 'Impossible d’activer ce périphérique. Vérifiez ses autorisations.')
    }
  }

  async function toggleRaisedHand() {
    try {
      const next = !handRaised
      await room.localParticipant.publishData(Uint8Array.from(new TextEncoder().encode(JSON.stringify({ type: next ? 'hand-raise' : 'hand-lower' }))), {
        reliable: true,
        destinationIdentities: [session.teacherId],
        topic: 'hand-raise',
      })
      setHandRaised(next)
    } catch {
      toast.error('Impossible d’envoyer votre demande de parole.')
    }
  }

  async function setSpeaker(identity: string, grant: boolean) {
    setGranting(identity)
    try {
      const response = await fetch('/api/live/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session, caller, targetIdentity: identity, grant }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Impossible de modifier la permission.')
      if (grant) setRaisedHands((current) => current.filter((hand) => hand.identity !== identity))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de modifier la permission.')
    } finally {
      setGranting('')
    }
  }

  const isTeacher = caller.role === 'teacher'
  const raised = raisedHands.map((hand) => ({
    ...hand,
    participant: participants.find((participant) => participant.identity === hand.identity),
  }))

  return <>
    <div className="livekit-video-grid">
      {tracks.length ? <GridLayout tracks={tracks}><ParticipantTile/></GridLayout> : <div className="live-video-placeholder"><Radio aria-hidden="true"/><p>En attente du flux vidéo de l’enseignant…</p></div>}
    </div>
    <div className="live-room-controls">
      {isTeacher ? <>
        <button type="button" className={microphoneOn ? 'live-control-button is-on' : 'live-control-button'} onClick={() => void updateDevice('microphone')}><span className="sr-only">{microphoneOn ? 'Désactiver le microphone' : 'Activer le microphone'}</span>{microphoneOn ? <Mic aria-hidden="true"/> : <MicOff aria-hidden="true"/>}</button>
        <button type="button" className={cameraOn ? 'live-control-button is-on' : 'live-control-button'} onClick={() => void updateDevice('camera')}><span className="sr-only">{cameraOn ? 'Désactiver la caméra' : 'Activer la caméra'}</span>{cameraOn ? <Camera aria-hidden="true"/> : <CameraOff aria-hidden="true"/>}</button>
        <button type="button" className={screenOn ? 'live-control-button is-on' : 'live-control-button'} onClick={() => void updateDevice('screen')}><span className="sr-only">{screenOn ? 'Arrêter le partage d’écran' : 'Partager l’écran'}</span>{screenOn ? <ScreenShareOff aria-hidden="true"/> : <ScreenShare aria-hidden="true"/>}</button>
      </> : <>
        <button type="button" className={handRaised ? 'live-control-button is-on' : 'live-control-button'} onClick={() => void toggleRaisedHand()}><Hand aria-hidden="true"/> {handRaised ? 'Baisser la main' : 'Lever la main'}</button>
        <button type="button" className="live-control-button" disabled={!microphoneGranted} onClick={() => void updateDevice('microphone')}><span className="sr-only">{microphoneOn ? 'Désactiver le microphone' : 'Activer le microphone'}</span>{microphoneOn ? <Mic aria-hidden="true"/> : <MicOff aria-hidden="true"/>} {microphoneGranted ? 'Microphone' : 'Parole non autorisée'}</button>
      </>}
    </div>
    {isTeacher && <section className="live-raised-hands"><h3><Users aria-hidden="true"/> Demandes de parole ({raised.length})</h3>{raised.length === 0 && <p>Aucune demande pour le moment.</p>}{raised.map(({ identity, name, participant }) => {
      const isPublishing = Boolean(participant?.permissions?.canPublish)
      return <article className="live-raised-hand" key={identity}><span><Hand aria-hidden="true"/>{name}</span><button type="button" className="button-soft" disabled={granting === identity} onClick={() => void setSpeaker(identity, !isPublishing)}>{isPublishing ? 'Retirer la parole' : 'Autoriser à parler'}</button></article>
    })}</section>}
    <span className="sr-only">{t('liveSession')}</span>
  </>
}

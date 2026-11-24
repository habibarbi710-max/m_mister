'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, CalendarDays, ExternalLink, Radio } from 'lucide-react'
import { toast } from 'sonner'
import * as api from '@/lib/api'
import { useAuth } from '@/components/shared/auth-provider'
import { useLanguage } from '@/components/shared/language-provider'
import { translateApiError } from '@/components/shared/api-error'
import { LiveRoomClient } from '@/components/student/live-room-client'
import { LiveRoomPanels } from '@/components/student/live-room-panels'
import { terminateLiveKitRoom } from '@/lib/livekit-client'
import { formatLiveSessionDate, liveSessionStart } from '@/lib/live-time'
import type { LiveSession } from '@/types'

export function LiveRoomPage({ id }: { id: string }) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [session, setSession] = useState<LiveSession>()
  const [canAccessRoom, setCanAccessRoom] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const [liveSession, access] = await Promise.all([
          api.getLiveSession(id),
          api.getContentAccess({ type: 'live-session', sessionId: id }),
        ])
        if (!active) return
        setSession(liveSession)
        setCanAccessRoom(access)
      } catch {
        if (active) toast.error(t('unknownError'))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => { active = false; window.clearInterval(timer) }
  }, [id, t])

  async function changeStatus(status: 'live' | 'ended') {
    if (!session) return
    if (status === 'ended' && session.provider === 'livekit' && user?.role === 'teacher') {
      const ended = await terminateLiveKitRoom(session, user)
      if (!ended.ok) {
        toast.error(translateApiError(ended.error, t))
        return
      }
    }
    const result = await api.setLiveSessionStatus(session.id, status)
    if (!result.ok) {
      toast.error(translateApiError(result.error, t))
      return
    }
    setSession(result.data)
    toast.success(status === 'live' ? 'Le direct a commencé.' : 'Le direct est terminé.')
  }

  if (loading) return <section className="app-page"><div className="loading-surface"><span className="skeleton-line"/><span className="skeleton-video"/><span className="skeleton-line"/></div></section>
  if (!session || !user) return <section className="app-page"><div className="empty-state"><Radio aria-hidden="true"/><h1>Séance introuvable</h1><Link className="button-soft" href="/live">{t('returnHome')}</Link></div></section>

  const isTeacher = user.role === 'teacher' && session.teacherId === user.id
  const isStudent = user.role === 'student'
  const canJoin = isTeacher || (isStudent && canAccessRoom)
  const start = liveSessionStart(session).getTime()
  const roomOpens = start - 15 * 60_000
  const joinWindowOpen = now >= roomOpens
    && now <= start + session.durationMinutes * 60_000
    && (session.status === 'live' || session.status === 'scheduled')
  const remaining = Math.max(0, roomOpens - now)
  const hours = Math.floor(remaining / 3_600_000)
  const minutes = Math.floor((remaining % 3_600_000) / 60_000)
  const seconds = Math.floor((remaining % 60_000) / 1000)

  return <section className="app-page live-room-page">
    <Link href="/live" className="live-room-back"><ArrowLeft aria-hidden="true"/> Retour aux séances</Link>
    <header className="live-room-heading">
      <div><p className="section-kicker">{session.status === 'live' ? 'EN DIRECT' : t('liveSession')}</p><h1>{session.title}</h1><p><CalendarDays aria-hidden="true"/>{formatLiveSessionDate(session)}</p></div>
      {session.status === 'live' && <span className="live-indicator"><i/> EN DIRECT</span>}
    </header>
    {session.description && <p className="live-room-description">{session.description}</p>}

    {session.status === 'cancelled' && <div className="live-room-alert" role="status">Cette séance a été annulée.</div>}
    {session.status === 'ended' && <div className="live-room-alert" role="status"><p>Cette séance est terminée.</p>{session.replayUrl && <a className="button-primary" href={session.replayUrl} target="_blank" rel="noreferrer">Regarder le replay <ExternalLink aria-hidden="true"/></a>}</div>}
    {session.status === 'live' && !joinWindowOpen && <div className="live-room-alert" role="status">La salle est fermée : la durée prévue de la séance est écoulée.</div>}
    {session.status === 'scheduled' && !joinWindowOpen && <div className="live-countdown-card" role="status"><CalendarDays aria-hidden="true"/><h2>La salle ouvrira 15 minutes avant le début</h2><p>{hours} h {minutes} min {seconds} s</p></div>}
    {joinWindowOpen && !canJoin && <div className="live-room-alert" role="status">{user.role === 'teacher' ? <p>Seul l’enseignant propriétaire peut gérer cette salle.</p> : <><p>Une inscription acceptée à la classe est nécessaire pour rejoindre cette séance.</p><Link className="button-primary" href="/groups">Trouver une classe</Link></>}</div>}

    {joinWindowOpen && canJoin && session.status !== 'cancelled' && session.status !== 'ended' && <>
      {isTeacher && session.status === 'scheduled' && <button className="button-primary live-start-button" type="button" onClick={() => void changeStatus('live')}>Démarrer le live <Radio aria-hidden="true"/></button>}
      {isTeacher && session.status === 'live' && <button className="button-destructive live-end-button" type="button" onClick={() => void changeStatus('ended')}>Terminer le live</button>}
      <div className="live-room-layout"><LiveRoomClient session={session} user={user} active={canJoin}/><LiveRoomPanels session={session} user={user} active={canJoin}/></div>
    </>}
    {!joinWindowOpen && canJoin && <div className="live-room-archived-panels"><LiveRoomPanels session={session} user={user} active={false}/></div>}
  </section>
}

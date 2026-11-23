'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BookOpenCheck, ChartNoAxesColumnIncreasing, ClipboardCheck, ShieldCheck, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import * as api from '@/lib/api'
import type { Lesson, LiveSession, QuizResult, Subscription, Subject, User } from '@/types'
import { useLanguage } from '@/components/shared/language-provider'
import { formatLiveSessionDate, liveSessionStart } from '@/lib/live-time'

export function StudentDashboard({ user }: { user: User }) {
  const { t } = useLanguage()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [lessons, setLessons] = useState<string[]>([])
  const [results, setResults] = useState<QuizResult[]>([])
  const [subscription, setSubscription] = useState<Subscription>({ status: 'None' })
  const [sessions, setSessions] = useState<LiveSession[]>([])
  const [remaining, setRemaining] = useState(0)
  const [now, setNow] = useState(0)
  const [lastViewed, setLastViewed] = useState<string | null>(null)
  const [myTeachers, setMyTeachers] = useState<Awaited<ReturnType<typeof api.getMyTeachers>>>([])
  const [announcements, setAnnouncements] = useState<Awaited<ReturnType<typeof api.getTeacherAnnouncements>>>([])
  const [myGroups, setMyGroups] = useState<Awaited<ReturnType<typeof api.getMyGroupEnrollments>>>([])
  const [paymentsEnabled, setPaymentsEnabled] = useState(false)
  useEffect(() => {
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    void Promise.all([api.getSubjects(), api.getCompletedLessons(), api.getQuizResults(), api.getSubscription(), api.getLiveSessions(), api.getLastViewedLesson(), api.getMyTeachers(), api.getTeacherAnnouncements(), api.getMyGroupEnrollments(), api.getSettings()])
      .then(([subjectsData, completed, attempts, plan, live, lastViewed, followedTeachers, news, groups, settings]) => {
        setSubjects(subjectsData)
        setLessons(completed)
        setResults(attempts)
        setSubscription(plan)
        setRemaining(plan.expiresAt ? Math.max(0, Math.ceil((new Date(plan.expiresAt).getTime() - Date.now()) / 86400000)) : 0)
        setSessions(live.filter((session) => session.status === 'live' || session.status === 'scheduled')
          .sort((a, b) => Number(b.status === 'live') - Number(a.status === 'live') || liveSessionStart(a).getTime() - liveSessionStart(b).getTime()))
        setLastViewed(lastViewed)
        setMyTeachers(followedTeachers)
        setAnnouncements(news)
        setMyGroups(groups)
        setPaymentsEnabled(settings.paymentsEnabled === true)
      })
      .catch(() => toast.error(t('unknownError')))
    return () => window.clearInterval(timer)
  }, [t])
  const allLessons = subjects.flatMap((subject) => subject.chapters.flatMap((chapter) => chapter.lessons))
  const lastLesson = allLessons.find((lesson) => lesson.id === lastViewed)
    ?? allLessons.find((lesson) => !lessons.includes(lesson.id))
    ?? allLessons[0]
  const nextSession = sessions.find((session) => session.status === 'live'
    || now > 0 && liveSessionStart(session).getTime() >= now && liveSessionStart(session).getTime() - now <= 24 * 60 * 60_000)
  return <section className="app-page">
    <header className="page-heading"><div><p className="section-kicker">Votre espace d’apprentissage</p><h1>{user.name}</h1><p>{user.section}</p></div></header>
    <div className="dashboard-stats">
      <Stat icon={BookOpenCheck} label={t('completed')} value={String(lessons.length)} />
      <Stat icon={ChartNoAxesColumnIncreasing} label={t('progress')} value={allLessons.length ? `${Math.round(lessons.length / allLessons.length * 100)}%` : '0%'} />
      <Stat icon={ClipboardCheck} label={t('attempts')} value={String(results.length)} />
      {paymentsEnabled
        ? <Stat icon={ShieldCheck} label={t('pricing')} value={subscription.status === 'Active' ? `${remaining} ${t('days')}` : t('locked')} />
        : <Stat icon={Users} label="Mes classes" value={String(myGroups.filter(({ enrollment }) => enrollment.status === 'accepté').length)} />}
    </div>
    <div className="dashboard-grid">
      <div>
        <h2>Mes classes</h2>
        {myGroups.length ? <div className="teacher-cards">{myGroups.map(({ group, enrollment }) => <article className="teacher-card" key={group.id}>
          <h3>{group.name}</h3><p>Inscription : {enrollment.status}</p>
          {paymentsEnabled && group.monthlyPrice !== null && <p>{group.monthlyPrice} TND par mois</p>}
          <Link href="/student/groups">Voir mes classes</Link>
        </article>)}</div> : <p>Rejoignez une classe pour retrouver ici vos cours et vos séances.</p>}
        <Link className="text-link" href="/groups">Trouver une classe</Link>
        <h2>Mes professeurs</h2>
        {myTeachers.length ? <div className="teacher-cards">{myTeachers.map((teacher) => <article className="teacher-card" key={teacher.id}>
          <h3>{teacher.name}</h3><p>{teacher.specialties.join(' · ') || 'Professeur EduBac'}</p>
          {teacher.newLessonCount > 0 && <p>{teacher.newLessonCount} nouveau(x) cours depuis votre dernière visite</p>}
          <Link href={`/teachers/${teacher.id}`}>Voir le profil</Link>
        </article>)}</div> : <p>Suivez un professeur pour retrouver ici ses nouveaux cours.</p>}
        <h2>Annonces de mes professeurs</h2>
        {announcements.length ? announcements.slice(0, 5).map((announcement) => <article className="relationship-post" key={announcement.id}><h3>{announcement.title}</h3><p>{announcement.body}</p></article>) : <p>Aucune annonce récente.</p>}
        <h2>{t('continueLearning')}</h2>
        {lastLesson ? <Link className="continue-card" href={`/lessons/${lastLesson.id}`}><h3>{lastLesson.title}</h3><span>{t('open')} →</span></Link> : <p>{t('noData')}</p>}
        <h2>{t('progress')}</h2>
        {subjects.map((subject) => {
          const subjectLessons = subject.chapters.flatMap((chapter) => chapter.lessons)
          const completed = subjectLessons.filter((lesson) => lessons.includes(lesson.id)).length
          const percent = subjectLessons.length ? Math.round(completed / subjectLessons.length * 100) : 0
          return <div className="progress-row" key={subject.id}><b>{subject.title}</b><span>{percent}%</span><progress max="100" value={percent}/></div>
        })}
        <h2>{t('attempts')}</h2>
        {results.length ? results.slice(0, 5).map((result) => <p key={result.id}>{result.title} · {result.score}% · {new Date(result.date).toLocaleDateString('fr-FR')}</p>) : <p>{t('noData')}</p>}
      </div>
      <aside className="dashboard-aside"><h2>{t('liveSession')}</h2>{nextSession ? <article className="live-card"><span className={nextSession.status === 'live' ? 'live-indicator' : 'session-date'}>{nextSession.status === 'live' ? 'EN DIRECT' : formatLiveSessionDate(nextSession)}</span><h3>{nextSession.title}</h3><Link href={`/live/${nextSession.id}`}>{nextSession.status === 'live' ? t('joinSession') : t('open')}</Link></article> : <p>{t('noData')}</p>}</aside>
    </div>
  </section>
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return <div className="stat-card"><span className="stat-icon"><Icon aria-hidden="true"/></span><span className="stat-label">{label}</span><b>{value}</b></div>
}


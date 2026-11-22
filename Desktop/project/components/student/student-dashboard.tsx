'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { BookOpenCheck, ChartNoAxesColumnIncreasing, ClipboardCheck, ShieldCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import * as api from '@/lib/api'
import type { Lesson, LiveSession, QuizResult, Subscription, Subject, User } from '@/types'
import { useLanguage } from '@/components/shared/language-provider'

export function StudentDashboard({ user }: { user: User }) {
  const { t } = useLanguage()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [lessons, setLessons] = useState<string[]>([])
  const [results, setResults] = useState<QuizResult[]>([])
  const [subscription, setSubscription] = useState<Subscription>({ status: 'None' })
  const [sessions, setSessions] = useState<LiveSession[]>([])
  const [remaining, setRemaining] = useState(0)
  const [lastViewed, setLastViewed] = useState<string | null>(null)
  useEffect(() => {
    void Promise.all([api.getSubjects(), api.getCompletedLessons(), api.getQuizResults(), api.getSubscription(), api.getLiveSessions(), api.getLastViewedLesson()])
      .then(([subjectsData, completed, attempts, plan, live, lastViewed]) => {
        setSubjects(subjectsData)
        setLessons(completed)
        setResults(attempts)
        setSubscription(plan)
        setRemaining(plan.expiresAt ? Math.max(0, Math.ceil((new Date(plan.expiresAt).getTime() - Date.now()) / 86400000)) : 0)
        setSessions(live.filter((session) => !session.cancelled && new Date(`${session.date}T${session.time}:00`).getTime() >= Date.now()).sort((a, b) => a.date.localeCompare(b.date)))
        setLastViewed(lastViewed)
      })
  }, [])
  const allLessons = subjects.flatMap((subject) => subject.chapters.flatMap((chapter) => chapter.lessons))
  const lastLesson = allLessons.find((lesson) => lesson.id === lastViewed)
    ?? allLessons.find((lesson) => !lessons.includes(lesson.id))
    ?? allLessons[0]
  const nextSession = sessions[0]
  return <section className="app-page">
    <header className="page-heading"><div><p className="section-kicker">Votre espace d’apprentissage</p><h1>{user.name}</h1><p>{t(sectionTranslationKeys[user.section])}</p></div></header>
    <div className="dashboard-stats">
      <Stat icon={BookOpenCheck} label={t('completed')} value={String(lessons.length)} />
      <Stat icon={ChartNoAxesColumnIncreasing} label={t('progress')} value={allLessons.length ? `${Math.round(lessons.length / allLessons.length * 100)}%` : '0%'} />
      <Stat icon={ClipboardCheck} label={t('attempts')} value={String(results.length)} />
      <Stat icon={ShieldCheck} label={t('pricing')} value={subscription.status === 'Active' ? `${remaining} ${t('days')}` : t('locked')} />
    </div>
    <div className="dashboard-grid">
      <div>
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
      <aside className="dashboard-aside"><h2>{t('liveSession')}</h2>{nextSession ? <article className="live-card"><h3>{nextSession.title}</h3><p>{nextSession.date} · {nextSession.time}</p><Link href="/live">{t('open')}</Link></article> : <p>{t('noData')}</p>}</aside>
    </div>
  </section>
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return <div className="stat-card"><span className="stat-icon"><Icon aria-hidden="true"/></span><span className="stat-label">{label}</span><b>{value}</b></div>
}

const sectionTranslationKeys = {
  Mathématiques: 'sectionMath',
  'Sciences expérimentales': 'sectionScience',
  Technique: 'sectionTechnical',
  Informatique: 'sectionComputerScience',
} as const

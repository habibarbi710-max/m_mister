'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BookOpen, CalendarDays, CheckCircle2, ChevronDown, CirclePlay, FileText, LockKeyhole, Target } from 'lucide-react'
import * as api from '@/lib/api'
import type { Exam, Lesson, LiveSession, Subject, Subscription } from '@/types'
import { useLanguage } from '@/components/shared/language-provider'
import { useAuth } from '@/components/shared/auth-provider'

export function SubjectCatalog() {
  const { t } = useLanguage()
  const [subjects, setSubjects] = useState<Subject[]>([])
  useEffect(() => { void api.getSubjects().then(setSubjects) }, [])
  return <section className="app-page"><header className="page-heading"><div><p className="section-kicker">Révisions par matière</p><h1>{t('courses')}</h1><p>Choisissez une matière pour parcourir les chapitres et les leçons disponibles.</p></div></header><div className="catalog-grid">{subjects.map((subject) => {
    const Icon = subject.id === 'physics' ? Target : BookOpen
    const lessons = subject.chapters.reduce((count, chapter) => count + chapter.lessons.length, 0)
    return <article className={`catalog-card subject-${subject.id}`} key={subject.id}><span className="subject-icon"><Icon aria-hidden="true"/></span><h2>{subject.titleFr}</h2><p>{subject.description}</p><span className="subject-count">{subject.chapters.length} chapitres · {lessons} cours</span><Link className="button-soft" href={`/subjects/${subject.id}`}>{t('open')}</Link></article>
  })}</div></section>
}

export function SubjectPage({ id }: { id: string }) {
  const { t } = useLanguage()
  const [subject, setSubject] = useState<Subject>()
  useEffect(() => { void api.getSubject(id).then(setSubject) }, [id])
  if (!subject) return <section className="app-page"><div className="loading-surface"><span className="skeleton-line"/><span className="skeleton-line"/></div></section>
  return <section className="app-page"><header className="page-heading"><div><p className="section-kicker">{t('courses')}</p><h1>{subject.titleFr}</h1><p>{subject.description}</p></div></header>{subject.chapters.map((chapter) => <details className="chapter-box" key={chapter.id} open><summary><span><strong>{chapter.title}</strong><small>{chapter.lessons.length} cours</small></span><ChevronDown className="chapter-chevron" aria-hidden="true"/></summary><div className="chapter-lessons">{chapter.lessons.map((lesson) => <LessonLink key={lesson.id} lesson={lesson}/>)}</div></details>)}</section>
}

function LessonLink({ lesson }: { lesson: Lesson }) {
  const { t } = useLanguage()
  const [active, setActive] = useState(false)
  useEffect(() => { void api.getSubscription().then((subscription) => setActive(subscription.status === 'Active')) }, [])
  const locked = !lesson.isFree && !active
  return <Link className={`lesson-row${locked ? ' is-locked' : ''}`} href={locked ? '/pricing' : `/lessons/${lesson.id}`}><span className="lesson-row-icon">{locked ? <LockKeyhole aria-hidden="true"/> : lesson.isFree ? <CirclePlay aria-hidden="true"/> : <BookOpen aria-hidden="true"/>}</span><span className="lesson-row-copy"><strong>{lesson.title}</strong><small>{lesson.duration} min · {lesson.isFree ? t('free') : t('paid')}</small></span><span className="lesson-row-status">{locked ? t('locked') : t('open')}</span></Link>
}

export function ExamList() {
  const { t } = useLanguage()
  const [exams, setExams] = useState<Exam[]>([])
  const [subject, setSubject] = useState('all')
  const [year, setYear] = useState('all')
  const [subscription, setSubscription] = useState<Subscription>({ status: 'None' })
  useEffect(() => { void Promise.all([api.getExams(), api.getSubscription()]).then(([rows, plan]) => { setExams(rows); setSubscription(plan) }) }, [])
  const rows = exams.filter((exam) => (subject === 'all' || exam.subjectId === subject) && (year === 'all' || String(exam.year) === year))
  return <section className="app-page"><header className="page-heading"><div><p className="section-kicker">Sujets et corrections</p><h1>{t('exams')}</h1><p>Retrouvez les sujets disponibles et leurs corrections.</p></div></header><div className="catalog-toolbar"><label>{t('subject')}<select value={subject} onChange={(event) => setSubject(event.target.value)}><option value="all">{t('all')}</option><option value="math">{t('subjectMath')}</option><option value="physics">{t('subjectPhysics')}</option></select></label><label>{t('date')}<select value={year} onChange={(event) => setYear(event.target.value)}><option value="all">{t('all')}</option>{[...new Set(exams.map((exam) => exam.year))].map((item) => <option key={item}>{item}</option>)}</select></label></div>{rows.map((exam) => <details className="exam-card" key={exam.id}><summary><span className="exam-icon"><FileText aria-hidden="true"/></span><span>{exam.subjectId === 'math' ? t('subjectMath') : t('subjectPhysics')} · {exam.year} · {exam.session}</span></summary><pre>{exam.statement}</pre>{subscription.status === 'Active' ? <p>{exam.correction}</p> : <Link className="button-soft" href="/pricing"><LockKeyhole aria-hidden="true"/>{t('locked')}</Link>}</details>)}{rows.length === 0 && <div className="empty-state"><FileText aria-hidden="true"/><h2>{t('noData')}</h2><p>Les annales apparaîtront ici lorsqu’elles seront publiées.</p></div>}</section>
}

export function LiveSessions() {
  const { t } = useLanguage()
  const [sessions, setSessions] = useState<LiveSession[]>([])
  const [active, setActive] = useState(false)
  const [now, setNow] = useState(0)
  useEffect(() => {
    void Promise.all([api.getLiveSessions(), api.getSubscription()]).then(([rows, plan]) => { setSessions(rows); setActive(plan.status === 'Active'); setNow(Date.now()) })
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [t])
  const upcoming = sessions.filter((session) => !session.cancelled && (!now || new Date(`${session.date}T${session.time}:00`).getTime() >= now))
  return <section className="app-page"><header className="page-heading"><div><p className="section-kicker">Apprendre ensemble</p><h1>{t('sessions')}</h1><p>Consultez les prochaines séances et les replays disponibles.</p></div></header>{upcoming.length === 0 && !sessions.some((session) => session.replay) && <div className="empty-state"><CalendarDays aria-hidden="true"/><h2>{t('noData')}</h2><p>Les séances publiées par les enseignants apparaîtront ici.</p></div>}{upcoming.map((session) => {
    const start = new Date(`${session.date}T${session.time}:00`).getTime()
    return <article className="session-card" key={session.id}><span className="session-date"><CalendarDays aria-hidden="true"/>{session.date} · {session.time}</span><h2>{session.title}</h2><p className="session-countdown">{t('startsIn')}: {countdown(Math.max(0, start - now), t)}</p>{active && session.meetingUrl ? <a className="button-primary" href={session.meetingUrl} target="_blank" rel="noreferrer">{t('joinSession')}</a> : <Link className="button-soft" href="/pricing">{t('locked')}</Link>}</article>
  })}{sessions.filter((session) => session.replay).length > 0 && <section className="replay-list"><h2>{t('replay')}</h2>{sessions.filter((session) => session.replay).map((session) => <a className="lesson-row" key={`${session.id}-replay`} href={session.replay} target="_blank" rel="noreferrer"><span className="lesson-row-icon"><CirclePlay aria-hidden="true"/></span><span className="lesson-row-copy"><strong>{session.title}</strong><small>{t('replay')}</small></span></a>)}</section>}</section>
}

function countdown(milliseconds: number, t: (key: 'days' | 'hours' | 'minutes') => string): string {
  const totalMinutes = Math.floor(milliseconds / 60000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  return `${days} ${t('days')} ${hours} ${t('hours')} ${minutes} ${t('minutes')}`
}

export function StudentLesson({ id }: { id: string }) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [lesson, setLesson] = useState<Lesson>()
  const [completed, setCompleted] = useState(false)
  const [locked, setLocked] = useState(false)
  const [allLessons, setAllLessons] = useState<Lesson[]>([])
  useEffect(() => {
    setLocked(false)
    setLesson(undefined)
    setCompleted(false)
    void api.getSubjects().then((rows) => setAllLessons(rows.flatMap((subject) => subject.chapters.flatMap((chapter) => chapter.lessons))))
      .catch(() => toast.error(t('unknownError')))
    void api.getLesson(id).then(async (row) => {
      if (row) {
        setLesson(row)
        const done = await api.getCompletedLessons()
        setCompleted(done.includes(id))
        await api.incrementLessonViews(id)
      } else {
        setLocked(true)
      }
    }).catch(() => { setLocked(true); toast.error(t('unknownError')) })
  }, [id, t])
  if (locked) return <section className="app-page"><div className="empty-state"><LockKeyhole aria-hidden="true"/><h1>{t('locked')}</h1><p>Abonnez-vous pour accéder au contenu de cette leçon.</p><Link className="button-primary" href="/pricing">{t('pricing')}</Link></div></section>
  if (!lesson) return <section className="app-page"><div className="loading-surface"><span className="skeleton-line"/><span className="skeleton-video"/><span className="skeleton-line"/></div></section>
  const index = allLessons.findIndex((item) => item.id === lesson.id)
  async function complete() {
    try {
      await api.completeLesson(id)
      setCompleted(true)
      toast.success(t('completed'))
    } catch {
      toast.error(t('unknownError'))
    }
  }
  return <section className="app-page lesson-page"><header className="lesson-page-heading"><div><p className="section-kicker">{t('courses')}</p><h1>{lesson.title}</h1></div>{completed && <span className="completed-badge"><CheckCircle2 aria-hidden="true"/>{t('completed')}</span>}</header><div className="lesson-layout"><aside className="lesson-sidebar"><h2>{t('courses')}</h2>{allLessons.map((item) => <Link className={item.id === lesson.id ? 'lesson-sidebar-link active' : 'lesson-sidebar-link'} href={`/lessons/${item.id}`} key={item.id} aria-current={item.id === lesson.id ? 'page' : undefined}><span>{item.title}</span><small>{item.duration} min</small></Link>)}</aside><div className="lesson-main">{lesson.videoUrl ? <iframe className="lesson-video" src={toEmbedUrl(lesson.videoUrl)} title={lesson.title} allowFullScreen/> : <div className="video-placeholder"><CirclePlay aria-hidden="true"/><p>{t('videoMissing')}</p></div>}<nav className="lesson-tabs" aria-label="Contenu du cours"><a href="#summary">{t('summary')}</a><a href="#exercises">{t('exercises')}</a><a href="#quiz">{t('quiz')}</a>{lesson.pdfUrl && <a href={lesson.pdfUrl} download>{t('pdf')}</a>}</nav><section id="summary"><h2>{t('summary')}</h2><p>{lesson.summary}</p></section><section id="exercises"><h2>{t('exercises')}</h2>{lesson.exercises.map((exercise, i) => <details className="exercise-item" key={`${exercise.prompt}-${i}`}><summary>{exercise.prompt}</summary><p>{exercise.correction}</p></details>)}</section><Quiz key={lesson.id} lesson={lesson} canSave={user?.role === 'student'}/>{user?.role === 'student' && <button className="button-primary completion-button" onClick={complete} disabled={completed}>{completed ? <><CheckCircle2 aria-hidden="true"/>{t('completed')}</> : t('markComplete')}</button>}<nav className="lesson-navigation">{index > 0 && <Link href={`/lessons/${allLessons[index - 1].id}`}>{t('previous')}</Link>}{index < allLessons.length - 1 && <Link href={`/lessons/${allLessons[index + 1].id}`}>{t('next')}</Link>}</nav></div></div></section>
}

function toEmbedUrl(value: string): string {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    if (host === 'youtu.be') return `https://www.youtube-nocookie.com/embed/${url.pathname.slice(1)}`
    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com')) {
      const id = url.searchParams.get('v') ?? url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1]
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : value
    }
    if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
      const id = url.pathname.match(/\/(\d+)(?:\/|$)/)?.[1]
      return id ? `https://player.vimeo.com/video/${id}` : value
    }
    return value
  } catch {
    return value
  }
}

function Quiz({ lesson, canSave }: { lesson: Lesson; canSave: boolean }) {
  const { t } = useLanguage()
  const [questionIndex, setQuestionIndex] = useState(0)
  const [choice, setChoice] = useState<number>()
  const [score, setScore] = useState(0)
  const [answers, setAnswers] = useState<number[]>([])
  const [finished, setFinished] = useState(false)
  const [saving, setSaving] = useState(false)
  const question = lesson.quiz.questions[questionIndex]
  if (!question) return <p>{t('noData')}</p>
  function answer(index: number) {
    if (choice !== undefined) return
    setChoice(index)
    setAnswers((previous) => [...previous, index])
    if (index === question.answer) setScore((value) => value + 1)
  }
  async function next() {
    if (questionIndex + 1 < lesson.quiz.questions.length) {
      setQuestionIndex((value) => value + 1)
      setChoice(undefined)
      return
    }
    try {
      if (canSave) {
        setSaving(true)
        await api.submitQuizResult(lesson.title, Math.round(score / lesson.quiz.questions.length * 100), lesson.id, answers)
      }
      setFinished(true)
    } catch {
      toast.error(t('unknownError'))
    } finally {
      setSaving(false)
    }
  }
  if (finished) return <section id="quiz" className="quiz-result"><span className="quiz-result-icon"><CheckCircle2 aria-hidden="true"/></span><p className="section-kicker">{t('completed')}</p><h2>{t('result')}</h2><strong className="quiz-score">{score}<span>/{lesson.quiz.questions.length}</span></strong><p>{canSave ? 'Votre résultat est enregistré dans votre espace.' : 'Quiz terminé.'}</p></section>
  const progress = Math.round((questionIndex + (choice === undefined ? 0 : 1)) / lesson.quiz.questions.length * 100)
  return <section id="quiz" className="quiz-panel"><div className="quiz-heading"><div><p className="section-kicker">{t('quiz')}</p><h2>{question.prompt}</h2></div><span className="quiz-question-count">{questionIndex + 1} / {lesson.quiz.questions.length}</span></div><div className="quiz-progress-track" role="progressbar" aria-label="Progression du quiz" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }}/></div><div className="quiz-options">{question.choices.map((item, index) => {
    const correctChoice = choice !== undefined && index === question.answer
    const wrongChoice = choice === index && choice !== question.answer
    return <button className={`quiz-option${correctChoice ? ' is-correct' : ''}${wrongChoice ? ' is-incorrect' : ''}`} key={item} disabled={choice !== undefined} aria-pressed={choice === index} onClick={() => answer(index)}><span className="quiz-option-letter">{String.fromCharCode(65 + index)}</span><span>{item}</span>{correctChoice && <CheckCircle2 aria-hidden="true"/>}</button>
  })}</div>{choice !== undefined && <div className={`quiz-feedback${choice === question.answer ? ' is-correct' : ' is-incorrect'}`} role="status"><strong>{choice === question.answer ? t('correct') : t('incorrect')}</strong><p>{question.explanation}</p></div>}{choice !== undefined && <button className="button-primary quiz-next" onClick={() => void next()} disabled={saving}>{saving ? t('loading') : t('next')}</button>}</section>
}

'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import type { Exam, Lesson, LessonVideo, LiveSession, Subject } from '@/types'
import * as api from '@/lib/api'
import { useLanguage } from '@/components/shared/language-provider'
import { useAuth } from '@/components/shared/auth-provider'
import { translateApiError } from '@/components/shared/api-error'
import { TeacherLiveSessions } from '@/components/teacher/teacher-live-sessions'

export type LessonFormValues = {
  id: string
  title: string
  duration: number
  videoUrl: string
  videos: LessonVideo[]
  summary: string
  pdfUrl: string
  isFree: boolean
  teacherId: string
  subjectId: string
  chapterId: string
  status: 'draft' | 'published'
  order: number
  exercises: Array<{ prompt: string; correction: string }>
  quiz: { id: string; title: string; questions: Array<{ id: string; prompt: string; choices: [string, string, string, string]; answer: number; explanation: string }> }
}
export const emptyLesson = (teacherId: string): LessonFormValues => ({
  id: `lesson-${Date.now()}`, title: '', duration: 30, videoUrl: '', summary: '', pdfUrl: '',
  videos: [],
  exercises: [{ prompt: '', correction: '' }],
  quiz: { id: `quiz-${Date.now()}`, title: '', questions: [{ id: `question-${Date.now()}`, prompt: '', choices: ['', '', '', ''], answer: 0, explanation: '' }] },
  isFree: false, teacherId, subjectId: '', chapterId: '', status: 'draft', order: 0,
})

export function TeacherDashboard() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [sessions, setSessions] = useState<LiveSession[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [editing, setEditing] = useState<LessonFormValues>()
  const [now, setNow] = useState(0)
  useEffect(() => {
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 60000)
    void Promise.all([api.getTeacherLessons(), api.getSubjects(), api.getLiveSessions(), api.getTeacherExams()]).then(([ownLessons, catalog, live, examRows]) => {
      setLessons(ownLessons)
      setSubjects(catalog)
      setSessions(live.filter((session) => session.teacherId === user?.id))
      setExams(examRows)
    })
    return () => window.clearInterval(timer)
  }, [user?.id])
  async function remove(id: string) {
    const response = await api.deleteLesson(id)
    if (!response.ok) return toast.error(translateApiError(response.error, t))
    setLessons(await api.getTeacherLessons())
    toast.success(t('deleted'))
  }
  async function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= lessons.length) return
    const next = [...lessons]
    ;[next[index], next[target]] = [next[target], next[index]]
    const response = await api.reorderLessons(next.map((lesson, order) => ({ lessonId: lesson.id, order })))
    if (!response.ok) return toast.error(translateApiError(response.error, t))
    setLessons(response.data.sort((a, b) => a.order - b.order))
  }
  return <section className="app-page teacher-panel">
    <header className="page-heading"><div><h1>{t('teacherHome')}</h1><p>{user?.name}</p></div><button className="button-primary" onClick={() => setEditing(emptyLesson(user?.id ?? ''))}>{t('createLesson')}</button></header>
    <div className="dashboard-stats"><Stat label={t('createLesson')} value={String(lessons.length)}/><Stat label={t('views')} value={String(lessons.reduce((sum, lesson) => sum + lesson.views, 0))}/><Stat label={t('liveSession')} value={String(sessions.filter((session) => session.status === 'scheduled' && new Date(`${session.date}T${session.startTime}:00+01:00`).getTime() >= now || session.status === 'live').length)}/></div>
    <section id="lessons" className="admin-table-card"><h2>{t('courses')}</h2>{lessons.length === 0 && <p>{t('noData')}</p>}<div className="teacher-cards">{lessons.map((lesson, index) => <article className="teacher-card" key={lesson.id}>
      <h3>{lesson.title}</h3><span>{lesson.status === 'draft' ? t('draft') : t('published')} · {lesson.isFree ? t('free') : t('paid')}</span>
      <p>{t('views')}: {lesson.views}</p>
      <QuizAverage lessonId={lesson.id} label={t('averageScore')}/>
      <div className="teacher-actions"><button onClick={() => setEditing(toFormValues(lesson))}>{t('editLesson')}</button><button onClick={() => void move(index, -1)}>{t('previous')}</button><button onClick={() => void move(index, 1)}>{t('next')}</button><button onClick={() => void remove(lesson.id)}>{t('delete')}</button><Link href={`/lessons/${lesson.id}?preview=1`}>{t('preview')}</Link></div>
    </article>)}</div></section>
    <TeacherSessions sessions={sessions} refresh={async () => setSessions((await api.getLiveSessions()).filter((session) => session.teacherId === user?.id))}/>
    <TeacherExams exams={exams} subjects={subjects} refresh={async () => setExams(await api.getTeacherExams())}/>
    {editing && <LessonEditor initial={editing} subjects={subjects} close={() => setEditing(undefined)} saved={async () => { setLessons(await api.getTeacherLessons()); setEditing(undefined) }}/>}
  </section>
}

export function LessonEditor({ initial, subjects, close, saved }: { initial: LessonFormValues; subjects: Subject[]; close: () => void; saved: () => Promise<void> }) {
  const { t } = useLanguage()
  const schema = useMemo(() => z.object({
    id: z.string(), title: z.string().trim().min(2, t('nameLength')), duration: z.number().int(t('required')).positive(t('required')),
    videos: z.array(z.object({
      id: z.string(), title: z.string(), provider: z.enum(['bunny', 'vimeo', 'youtube', 'mp4']),
      url: z.string(), durationSeconds: z.number().nonnegative(), order: z.number().int(),
    })),
    videoUrl: z.string().url(t('videoError')).refine((value) => /(^|\.)((youtube\.com)|(youtu\.be)|(vimeo\.com)|(bunnycdn\.com)|(b-cdn\.net)|(iframe\.mediadelivery\.net))($|\/)/i.test(new URL(value).hostname), t('videoError')),
    summary: z.string().min(10, t('required')), pdfUrl: z.string(), isFree: z.boolean(),
    teacherId: z.string(), subjectId: z.string().min(1, t('required')), chapterId: z.string().min(1, t('required')),
    status: z.enum(['draft', 'published']), order: z.number().int().nonnegative(),
    exercises: z.array(z.object({ prompt: z.string().min(1, t('required')), correction: z.string().min(1, t('required')) })).min(1, t('required')),
    quiz: z.object({ id: z.string(), title: z.string().min(1, t('required')), questions: z.array(z.object({
      id: z.string(), prompt: z.string().min(1, t('required')), choices: z.tuple([z.string().min(1, t('required')), z.string().min(1, t('required')), z.string().min(1, t('required')), z.string().min(1, t('required'))]),
      answer: z.number().int().min(0, t('required')).max(3, t('required')), explanation: z.string().min(1, t('required')),
    })).min(1, t('required')) }),
  }), [t])
  const { register, control, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<LessonFormValues, undefined, LessonFormValues>({ resolver: zodResolver(schema), defaultValues: initial })
  const exerciseFields = useFieldArray({ control, name: 'exercises' })
  const questionFields = useFieldArray({ control, name: 'quiz.questions' })
  const subjectId = useWatch({ control, name: 'subjectId' })
  const chapters = subjects.find((subject) => subject.id === subjectId)?.chapters ?? []
  async function uploadPdf(file?: File) {
    if (!file) return
    if (file.type !== 'application/pdf' || file.size > 3 * 1024 * 1024) return toast.error(t('receiptInvalid'))
    try {
      const data = await fileToDataUrl(file)
      setValue('pdfUrl', data, { shouldValidate: true })
    } catch {
      toast.error(t('unknownError'))
    }
  }
  async function submit(values: LessonFormValues) {
    const response = await api.saveLesson(values)
    if (!response.ok) return toast.error(translateApiError(response.error, t))
    toast.success(t('saved'))
    await saved()
  }
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><form className="admin-modal lesson-editor" onSubmit={handleSubmit(submit)} noValidate>
    <button type="button" className="modal-close" onClick={close}>{t('cancel')}</button><h2>{initial.title ? t('editLesson') : t('createLesson')}</h2>
    <Field label={t('title')} error={errors.title?.message}><input {...register('title')}/></Field>
    <Field label={t('subject')} error={errors.subjectId?.message}><select {...register('subjectId')}><option value="">{t('subject')}</option>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.titleFr}</option>)}</select></Field>
    <Field label={t('chapter')} error={errors.chapterId?.message}><select {...register('chapterId')}><option value="">{t('chapter')}</option>{chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></Field>
    <Field label={t('duration')} error={errors.duration?.message}><input type="number" {...register('duration', { valueAsNumber: true })}/></Field>
    <Field label={t('videoUrl')} error={errors.videoUrl?.message}><input {...register('videoUrl')}/></Field>
    <Field label={t('summary')} error={errors.summary?.message}><textarea {...register('summary')}/></Field>
    <Field label={t('pdfUpload')} error={errors.pdfUrl?.message}><input type="file" accept="application/pdf" onChange={(event) => void uploadPdf(event.target.files?.[0])}/></Field>
    <Field label={t('status')}><select {...register('status')}><option value="draft">{t('draft')}</option><option value="published">{t('published')}</option></select></Field>
    <Field label={t('isFree')}><input type="checkbox" {...register('isFree')}/></Field>
    <section><h3>{t('exercises')}</h3>{exerciseFields.fields.map((field, index) => <fieldset key={field.id}><Field label={t('question')} error={errors.exercises?.[index]?.prompt?.message}><input {...register(`exercises.${index}.prompt`)}/></Field><Field label={t('correction')} error={errors.exercises?.[index]?.correction?.message}><textarea {...register(`exercises.${index}.correction`)}/></Field><button type="button" onClick={() => exerciseFields.remove(index)}>{t('delete')}</button></fieldset>)}<button type="button" onClick={() => exerciseFields.append({ prompt: '', correction: '' })}>{t('addExercise')}</button></section>
    <section><h3>{t('quiz')}</h3><Field label={t('title')} error={errors.quiz?.title?.message}><input {...register('quiz.title')}/></Field>{questionFields.fields.map((field, index) => <fieldset key={field.id}><Field label={t('question')} error={errors.quiz?.questions?.[index]?.prompt?.message}><input {...register(`quiz.questions.${index}.prompt`)}/></Field>{[0, 1, 2, 3].map((choice) => <Field key={choice} label={`${t('choices')} ${choice + 1}`} error={errors.quiz?.questions?.[index]?.choices?.[choice]?.message}><input {...register(`quiz.questions.${index}.choices.${choice as 0 | 1 | 2 | 3}`)}/></Field>)}<Field label={t('answer')}><select {...register(`quiz.questions.${index}.answer`, { valueAsNumber: true })}>{[0, 1, 2, 3].map((answer) => <option key={answer} value={answer}>{answer + 1}</option>)}</select></Field><Field label={t('explanation')} error={errors.quiz?.questions?.[index]?.explanation?.message}><textarea {...register(`quiz.questions.${index}.explanation`)}/></Field><button type="button" onClick={() => questionFields.remove(index)}>{t('delete')}</button><button type="button" onClick={() => questionFields.move(index, Math.max(0, index - 1))}>{t('previous')}</button><button type="button" onClick={() => questionFields.move(index, Math.min(questionFields.fields.length - 1, index + 1))}>{t('next')}</button></fieldset>)}<button type="button" onClick={() => questionFields.append({ id: `question-${Date.now()}`, prompt: '', choices: ['', '', '', ''], answer: 0, explanation: '' })}>{t('addQuestion')}</button></section>
    <button className="button-primary" disabled={isSubmitting}>{isSubmitting ? t('loading') : t('save')}</button>
  </form></div>
}

export function TeacherSessions({ sessions, refresh }: { sessions: LiveSession[]; refresh: () => Promise<void> }) {
  return <TeacherLiveSessions sessions={sessions} refresh={refresh} />
}

export function TeacherExams({ exams, subjects, refresh }: { exams: Exam[]; subjects: Subject[]; refresh: () => Promise<void> }) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const schema = useMemo(() => z.object({
    id: z.string(), subjectId: z.string().min(1, t('required')), year: z.number().int(t('required')).min(1990, t('required')).max(2100, t('required')),
    session: z.string().min(2, t('required')), statement: z.string().min(10, t('required')), correction: z.string().min(10, t('required')),
    ownerId: z.string().min(1), status: z.enum(['draft', 'published']), order: z.number().int().nonnegative(),
    createdAt: z.string().datetime(), updatedAt: z.string().datetime(), teacherId: z.string().optional(),
  }), [t])
  const emptyExam: Exam = {
    id: '', ownerId: user?.id ?? '', status: 'draft', order: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    subjectId: '', year: new Date().getFullYear(), session: '', statement: '', correction: '', teacherId: user?.id,
  }
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Exam>({ resolver: zodResolver(schema), defaultValues: emptyExam })
  async function submit(values: Exam) {
    const result = await api.saveExam({ ...values, id: values.id || `exam-${crypto.randomUUID()}` })
    if (!result.ok) return toast.error(translateApiError(result.error, t))
    reset({ ...emptyExam, id: '', subjectId: '', year: new Date().getFullYear(), session: '', statement: '', correction: '' })
    await refresh()
    toast.success(t('saved'))
  }
  return <section id="exams" className="admin-table-card"><h2>{t('exams')}</h2><form onSubmit={handleSubmit(submit)} noValidate><Field label={t('title')} error={errors.session?.message}><input {...register('session')}/></Field><Field label={t('subject')} error={errors.subjectId?.message}><select {...register('subjectId')}><option value="">{t('subject')}</option>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.titleFr}</option>)}</select></Field><Field label={t('date')} error={errors.year?.message}><input type="number" {...register('year', { valueAsNumber: true })}/></Field><Field label={t('summary')} error={errors.statement?.message}><textarea {...register('statement')}/></Field><Field label={t('correction')} error={errors.correction?.message}><textarea {...register('correction')}/></Field><Field label={t('status')}><select {...register('status')}><option value="draft">{t('draft')}</option><option value="published">{t('published')}</option></select></Field><button className="button-primary" disabled={isSubmitting}>{isSubmitting ? t('loading') : t('save')}</button></form>{exams.length === 0 && <p>{t('noData')}</p>}{exams.map((exam) => <article key={exam.id}><span>{exam.subjectId} · {exam.year} · {exam.session}</span><button onClick={() => reset(exam)}>{t('editLesson')}</button><button onClick={async () => { const result = await api.deleteExam(exam.id); if (!result.ok) toast.error(translateApiError(result.error, t)); await refresh() }}>{t('delete')}</button></article>)}</section>
}

function QuizAverage({ lessonId, label }: { lessonId: string; label: string }) {
  const [performance, setPerformance] = useState<{ attempts: number; averageScore: number | null }>()
  useEffect(() => { void api.getLessonPerformance(lessonId).then(setPerformance) }, [lessonId])
  const { t } = useLanguage()
  return <p>{label}: {performance?.averageScore === null || !performance ? t('noData') : `${performance.averageScore}%`} · {t('attempts')}: {performance?.attempts ?? 0}</p>
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="stat-card"><span>{label}</span><b>{value}</b></div> }
function toFormValues(lesson: Lesson): LessonFormValues {
  return {
    ...lesson,
    subjectId: lesson.subjectId ?? '',
    chapterId: lesson.chapterId ?? '',
    quiz: {
      ...lesson.quiz,
      questions: lesson.quiz.questions.map((question) => ({
        ...question,
        choices: [question.choices[0] ?? '', question.choices[1] ?? '', question.choices[2] ?? '', question.choices[3] ?? ''],
      })),
    },
  }
}
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) { return <label className="form-field">{label}{children}{error && <small role="alert">{error}</small>}</label> }
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('PDF conversion failed'))
    reader.onerror = () => reject(new Error('PDF conversion failed'))
    reader.readAsDataURL(file)
  })
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { Exam, Lesson, LiveSession, Payment, PlatformSettings, Section, Subject, User } from '@/types'
import * as api from '@/lib/api'
import { authCreateTeacher } from '@/lib/auth'
import { emptyLesson, LessonEditor, TeacherExams, TeacherSessions, type LessonFormValues } from '@/components/teacher/teacher-dashboard'
import { useAuth } from '@/components/shared/auth-provider'
import { useLanguage } from '@/components/shared/language-provider'
import { translateApiError } from '@/components/shared/api-error'

type AdminTab = 'overview' | 'payments' | 'students' | 'teachers' | 'content' | 'settings'

export function AdminDashboard() {
  const { t } = useLanguage()
  const [tab, setTab] = useState<AdminTab>('overview')
  const [metrics, setMetrics] = useState<Awaited<ReturnType<typeof api.getAdminMetrics>>>()
  const [payments, setPayments] = useState<Payment[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [query, setQuery] = useState('')
  const [sectionFilter, setSectionFilter] = useState<Section | 'all'>('all')
  async function refresh() {
    const [stats, paymentRows, userRows, lessonRows, catalog] = await Promise.all([api.getAdminMetrics(), api.getPayments(), api.getUsers(), api.getTeacherLessons(), api.getSubjects()])
    setMetrics(stats)
    setPayments(paymentRows)
    setUsers(userRows)
    setLessons(lessonRows)
    setSubjects(catalog)
  }
  useEffect(() => { void refresh() }, [])
  const tabs: Array<[AdminTab, string]> = [['overview', t('adminHome')], ['payments', t('paymentHistory')], ['students', t('students')], ['teachers', t('teachers')], ['content', t('courses')], ['settings', t('settings')]]
  const filteredStudents = users.filter((user) => user.role === 'student'
    && `${user.name} ${user.email} ${user.phone}`.toLowerCase().includes(query.toLowerCase())
    && (sectionFilter === 'all' || user.section === sectionFilter))
  return <section className="app-page admin-layout">
    <nav className="admin-sidebar" aria-label={t('adminHome')}>{tabs.map(([id, label]) => <button className={tab === id ? 'admin-tab active' : 'admin-tab'} key={id} onClick={() => setTab(id)}>{label}</button>)}</nav>
    <div className="admin-content"><h1>{tabs.find(([id]) => id === tab)?.[1]}</h1>
      {tab === 'overview' && <div className="admin-stats">{[
        [t('students'), metrics?.students ?? 0], [t('subscription'), metrics?.activeSubscriptions ?? 0],
        [t('amount'), metrics?.revenue ?? 0], [t('paymentPending'), metrics?.pendingPayments ?? 0],
      ].map(([label, value]) => <article className="stat-card" key={String(label)}><span>{label}</span><b>{value}</b></article>)}</div>}
      {tab === 'payments' && <PaymentReview payments={payments} refresh={refresh}/>}
      {tab === 'students' && <section className="admin-table-card"><label>{t('search')}<input value={query} onChange={(event) => setQuery(event.target.value)}/></label><label>{t('section')}<select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value as Section | 'all')}><option value="all">{t('all')}</option>{sectionValues.map(([value, key]) => <option value={value} key={value}>{t(key)}</option>)}</select></label><div className="responsive-table"><table><thead><tr><th>{t('name')}</th><th>{t('email')}</th><th>{t('section')}</th><th>{t('blocked')}</th><th/></tr></thead><tbody>{filteredStudents.map((student) => <tr key={student.id}><td>{student.name}</td><td>{student.email}</td><td>{t(sectionValues.find(([value]) => value === student.section)?.[1] ?? 'sectionMath')}</td><td>{student.blocked ? t('blocked') : '—'}</td><td><button onClick={async () => { const result = await api.blockUser(student.id, !student.blocked); if (!result.ok) toast.error(translateApiError(result.error, t)); await refresh() }}>{student.blocked ? t('unblock') : t('block')}</button></td></tr>)}</tbody></table></div>{filteredStudents.length === 0 && <p>{t('noData')}</p>}</section>}
      {tab === 'teachers' && <TeacherManagement users={users} subjects={subjects} refresh={refresh}/>}
      {tab === 'content' && <ContentManagement lessons={lessons} subjects={subjects} refresh={refresh}/>}
      {tab === 'settings' && <SettingsForm/>}
    </div>
  </section>
}

function PaymentReview({ payments, refresh }: { payments: Payment[]; refresh: () => Promise<void> }) {
  const { t } = useLanguage()
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const planLabels = { monthly: t('planMonthly'), quarterly: t('planQuarterly'), annual: t('planAnnual') }
  return <section className="admin-table-card"><div className="responsive-table"><table><thead><tr><th>{t('name')}</th><th>{t('phone')}</th><th>{t('plan')}</th><th>{t('amount')}</th><th>{t('status')}</th><th>{t('uploadReceipt')}</th><th/></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id}><td>{payment.userName}</td><td>{payment.phone}</td><td>{planLabels[payment.plan as keyof typeof planLabels] ?? payment.plan}</td><td>{payment.amount}</td><td>{payment.status === 'Rejected' ? `${t('rejected')}: ${payment.rejectionReason ?? ''}` : payment.status === 'Pending' ? t('pending') : t('approved')}</td><td>{payment.receipt && <a href={payment.receipt} target="_blank" rel="noreferrer">{t('open')}</a>}</td><td>{payment.status === 'Pending' && <><button onClick={async () => { const result = await api.approvePayment(payment.id, true); if (!result.ok) toast.error(translateApiError(result.error, t)); await refresh() }}>{t('approve')}</button><input value={reasons[payment.id] ?? ''} placeholder={t('rejectionReason')} onChange={(event) => setReasons((previous) => ({ ...previous, [payment.id]: event.target.value }))}/><button onClick={async () => { const result = await api.approvePayment(payment.id, false, reasons[payment.id] ?? ''); if (!result.ok) return toast.error(translateApiError(result.error, t)); await refresh() }}>{t('reject')}</button></>}</td></tr>)}</tbody></table></div>{payments.length === 0 && <p>{t('noData')}</p>}</section>
}

function TeacherManagement({ users, subjects, refresh }: { users: User[]; subjects: Subject[]; refresh: () => Promise<void> }) {
  const { t } = useLanguage()
  const [selectedTeacher, setSelectedTeacher] = useState('')
  const [assigned, setAssigned] = useState<string[]>([])
  const schema = useMemo(() => z.object({
    name: z.string().min(2, t('nameLength')), email: z.string().email(t('invalidEmail')),
    phone: z.string().min(8, t('required')), password: z.string().min(8, t('passwordLength')),
    section: z.enum(['Mathématiques', 'Sciences expérimentales', 'Technique', 'Informatique']),
  }), [t])
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', phone: '', password: '', section: 'Mathématiques' as const } })
  useEffect(() => {
    if (!selectedTeacher) { setAssigned([]); return }
    void api.getTeacherAssignments(selectedTeacher).then(setAssigned).catch(() => toast.error(t('unknownError')))
  }, [selectedTeacher, t])
  async function submit(values: { name: string; email: string; phone: string; password: string; section: User['section'] }) {
    const response = await authCreateTeacher(values)
    if (!response.ok) return toast.error(translateApiError(response.error, t))
    setSelectedTeacher(response.data.id)
    await refresh()
    toast.success(t('registerSuccess'))
  }
  async function assign() {
    const response = await api.assignTeacherSubjects({ teacherId: selectedTeacher, subjectIds: assigned })
    if (!response.ok) return toast.error(translateApiError(response.error, t))
    toast.success(t('subjectsAssigned'))
  }
  const teachers = users.filter((user) => user.role === 'teacher')
  return <section className="admin-table-card"><h2>{t('teachers')}</h2><form onSubmit={handleSubmit(submit)} noValidate><Field label={t('name')} error={errors.name?.message}><input {...register('name')}/></Field><Field label={t('email')} error={errors.email?.message}><input type="email" {...register('email')}/></Field><Field label={t('phone')} error={errors.phone?.message}><input {...register('phone')}/></Field><Field label={t('password')} error={errors.password?.message}><input type="password" {...register('password')}/></Field><Field label={t('section')} error={errors.section?.message}><select {...register('section')}>{sectionValues.map(([value, key]) => <option value={value} key={value}>{t(key)}</option>)}</select></Field><button disabled={isSubmitting}>{isSubmitting ? t('loading') : t('register')}</button></form>
    <label>{t('assignSubjects')}<select value={selectedTeacher} onChange={(event) => setSelectedTeacher(event.target.value)}><option value="">{t('teachers')}</option>{teachers.map((teacher) => <option value={teacher.id} key={teacher.id}>{teacher.name}</option>)}</select></label>
    {subjects.map((subject) => <label key={subject.id}><input type="checkbox" checked={assigned.includes(subject.id)} onChange={(event) => setAssigned((current) => event.target.checked ? [...current, subject.id] : current.filter((id) => id !== subject.id))}/>{subject.titleFr}</label>)}<button onClick={() => void assign()} disabled={!selectedTeacher}>{t('assignSubjects')}</button>
  </section>
}

function ContentManagement({ lessons, subjects, refresh }: { lessons: Lesson[]; subjects: Subject[]; refresh: () => Promise<void> }) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [editing, setEditing] = useState<LessonFormValues>()
  const [exams, setExams] = useState<Exam[]>([])
  const [sessions, setSessions] = useState<LiveSession[]>([])
  async function refreshRelated() {
    const [examRows, liveRows] = await Promise.all([api.getTeacherExams(), api.getLiveSessions()])
    setExams(examRows)
    setSessions(liveRows)
  }
  useEffect(() => { void refreshRelated().catch(() => toast.error(t('unknownError'))) }, [t])
  const refreshLessons = async () => { await refresh(); await refreshRelated() }
  return <>
    <section className="admin-table-card"><button className="button-primary" onClick={() => setEditing(emptyLesson(user?.id ?? ''))}>{t('createLesson')}</button><div className="responsive-table"><table><thead><tr><th>{t('title')}</th><th>{t('subject')}</th><th>{t('status')}</th><th/></tr></thead><tbody>{lessons.map((lesson) => <tr key={lesson.id}><td>{lesson.title}</td><td>{subjects.find((subject) => subject.id === lesson.subjectId)?.titleFr ?? '—'}</td><td>{lesson.status === 'draft' ? t('draft') : t('published')}</td><td><button onClick={() => setEditing(asLessonFormValues(lesson))}>{t('editLesson')}</button><button onClick={async () => { const response = await api.saveLesson({ ...lesson, status: lesson.status === 'draft' ? 'published' : 'draft' }); if (!response.ok) toast.error(translateApiError(response.error, t)); await refresh() }}>{lesson.status === 'draft' ? t('published') : t('draft')}</button><button onClick={async () => { const response = await api.deleteLesson(lesson.id); if (!response.ok) toast.error(translateApiError(response.error, t)); await refresh() }}>{t('delete')}</button></td></tr>)}</tbody></table></div>{lessons.length === 0 && <p>{t('noData')}</p>}</section>
    <TeacherSessions sessions={sessions.filter((session) => session.teacherId === user?.id || user?.role === 'admin')} refresh={refreshRelated}/>
    <TeacherExams exams={exams} subjects={subjects} refresh={refreshRelated}/>
    {editing && <LessonEditor initial={editing} subjects={subjects} close={() => setEditing(undefined)} saved={async () => { await refreshLessons(); setEditing(undefined) }}/>}
  </>
}

function asLessonFormValues(lesson: Lesson): LessonFormValues {
  return {
    ...lesson, subjectId: lesson.subjectId ?? '', chapterId: lesson.chapterId ?? '',
    quiz: {
      ...lesson.quiz,
      questions: lesson.quiz.questions.map((question) => ({
        ...question,
        choices: [question.choices[0] ?? '', question.choices[1] ?? '', question.choices[2] ?? '', question.choices[3] ?? ''],
      })),
    },
  }
}

function SettingsForm() {
  const { t } = useLanguage()
  const schema = useMemo(() => z.object({ monthlyPrice: z.number().positive(t('invalidSetting')), paymentInstructions: z.string().min(5, t('required')) }), [t])
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<PlatformSettings>({ resolver: zodResolver(schema), defaultValues: { monthlyPrice: 12, paymentInstructions: '' } })
  useEffect(() => { void api.getSettings().then(reset) }, [reset])
  async function submit(values: PlatformSettings) {
    const result = await api.saveSettings(values)
    if (!result.ok) return toast.error(translateApiError(result.error, t))
    toast.success(t('saved'))
  }
  return <form className="settings-card" onSubmit={handleSubmit(submit)} noValidate><Field label={t('monthlyPrice')} error={errors.monthlyPrice?.message}><input type="number" {...register('monthlyPrice', { valueAsNumber: true })}/></Field><Field label={t('paymentInstructions')} error={errors.paymentInstructions?.message}><textarea {...register('paymentInstructions')}/></Field><button className="button-primary" disabled={isSubmitting}>{isSubmitting ? t('loading') : t('save')}</button></form>
}

const sectionValues = [
  ['Mathématiques', 'sectionMath'],
  ['Sciences expérimentales', 'sectionScience'],
  ['Technique', 'sectionTechnical'],
  ['Informatique', 'sectionComputerScience'],
] as const

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className="form-field">{label}{children}{error && <small role="alert">{error}</small>}</label>
}

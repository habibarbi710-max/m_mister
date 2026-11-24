'use client'

import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import type { LiveSession, Payment, PlatformSettings, Section, Subject, User } from '@/types'
import * as api from '@/lib/api'
import { authCreateTeacher } from '@/lib/auth'
import { AdminContentManagement } from '@/components/admin/admin-content-management'
import { useAuth } from '@/components/shared/auth-provider'
import { useLanguage } from '@/components/shared/language-provider'
import { translateApiError } from '@/components/shared/api-error'
import { terminateLiveKitRoom } from '@/lib/livekit-client'
import { AdminRelationshipsPage } from '@/components/relationships/relationship-pages'
import { AdminGroupsPage } from '@/components/groups/group-pages'

type AdminTab = 'overview' | 'pending' | 'payments' | 'students' | 'teachers' | 'content' | 'sessions' | 'groups' | 'settings' | 'relationships'

export function AdminDashboard() {
  const { t } = useLanguage()
  const [tab, setTab] = useState<AdminTab>('overview')
  const [metrics, setMetrics] = useState<Awaited<ReturnType<typeof api.getAdminMetrics>>>()
  const [payments, setPayments] = useState<Payment[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [sessions, setSessions] = useState<LiveSession[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [paymentsEnabled, setPaymentsEnabled] = useState(false)
  const [query, setQuery] = useState('')
  const [sectionFilter, setSectionFilter] = useState<Section | 'all'>('all')
  async function refresh() {
    const [stats, paymentRows, userRows, catalog, sessionRows, settings] = await Promise.all([api.getAdminMetrics(), api.getPayments(), api.getUsers(), api.getSubjects(), api.getLiveSessions(), api.getSettings()])
    setMetrics(stats)
    setPayments(paymentRows)
    setUsers(userRows)
    setSubjects(catalog)
    setSessions(sessionRows)
    setPaymentsEnabled(settings.paymentsEnabled === true)
  }
  useEffect(() => { void refresh() }, [])
  const tabs: Array<[AdminTab, string]> = [['overview', t('adminHome')], ['pending', 'Demandes d’inscription'], ['groups', 'Filières et classes'], ['payments', t('paymentHistory')], ['students', t('students')], ['teachers', t('teachers')], ['content', t('courses')], ['sessions', t('sessions')], ['relationships', 'Modération et engagements'], ['settings', t('settings')]]
  const pendingUsers = users.filter((user) => user.approvalStatus === 'pending')
  const filteredStudents = users.filter((user) => user.role === 'student'
    && `${user.name} ${user.email} ${user.phone}`.toLowerCase().includes(query.toLowerCase())
    && (sectionFilter === 'all' || user.section === sectionFilter))
  return <section className="app-page admin-layout">
    <nav className="admin-sidebar" aria-label={t('adminHome')}>{tabs.map(([id, label]) => <button className={tab === id ? 'admin-tab active' : 'admin-tab'} key={id} onClick={() => setTab(id)}>{label}</button>)}</nav>
    <div className="admin-content"><h1>{tabs.find(([id]) => id === tab)?.[1]}</h1>
      {process.env.NODE_ENV === 'development' && <button className="button-soft" type="button" onClick={async () => {
        if (!window.confirm('Réinitialiser les données de démonstration de ce navigateur ?')) return
        const result = await api.resetDemoData()
        if (!result.ok) {
          toast.error(translateApiError(result.error, t))
          return
        }
        await refresh()
        toast.success('Les données de démonstration ont été réinitialisées.')
      }}>Réinitialiser les données de démonstration</button>}
      {tab === 'overview' && <div className="admin-stats">{[
        [t('students'), metrics?.students ?? 0], [t('subscription'), metrics?.activeSubscriptions ?? 0],
        ...(paymentsEnabled ? [[t('amount'), metrics?.revenue ?? 0], [t('paymentPending'), metrics?.pendingPayments ?? 0]] : []),
        ['Séances ce mois', metrics?.liveSessionsThisMonth ?? 0],
      ].map(([label, value]) => <article className="stat-card" key={String(label)}><span>{label}</span><b>{value}</b></article>)}</div>}
      {tab === 'pending' && <section className="admin-table-card"><div className="responsive-table"><table><thead><tr><th>Nom</th><th>E-mail</th><th>Téléphone</th><th>Filière</th><th>Contacter</th><th>Décision</th></tr></thead><tbody>{pendingUsers.map((pending) => <tr key={pending.id}><td>{pending.name}</td><td>{pending.email || '—'}</td><td>{pending.phone || '—'}</td><td>{pending.section}</td><td>{pending.email ? <a className="button-soft" href={`mailto:${pending.email}?subject=Validation%20du%20compte%20Learn%20With%20Me`}>E-mail</a> : pending.phone ? <a className="button-soft" href={`tel:${pending.phone}`}>Appeler</a> : '—'}</td><td><button onClick={async () => { const result = await api.approveUser(pending.id, true); if (!result.ok) toast.error(translateApiError(result.error, t)); await refresh(); if (result.ok) toast.success('Compte approuvé.') }}>Approuver</button><button className="button-soft" onClick={async () => { const result = await api.approveUser(pending.id, false); if (!result.ok) toast.error(translateApiError(result.error, t)); await refresh(); if (result.ok) toast.success('Demande refusée.') }}>Refuser</button></td></tr>)}</tbody></table></div>{pendingUsers.length === 0 && <p>Aucune demande en attente.</p>}</section>}
      {tab === 'payments' && (paymentsEnabled ? <PaymentReview payments={payments} refresh={refresh}/>
        : <div className="empty-state"><h2>Paiements désactivés</h2><p>Activez les paiements dans les paramètres pour afficher les demandes.</p></div>)}
      {tab === 'groups' && <AdminGroupsPage/>}
      {tab === 'students' && <section className="admin-table-card"><label>{t('search')}<input value={query} onChange={(event) => setQuery(event.target.value)}/></label><label>{t('section')}<select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value as Section | 'all')}><option value="all">{t('all')}</option>{sectionValues.map((section) => <option value={section} key={section}>{section}</option>)}</select></label><div className="responsive-table"><table><thead><tr><th>{t('name')}</th><th>{t('email')}</th><th>{t('section')}</th><th>{t('blocked')}</th><th/></tr></thead><tbody>{filteredStudents.map((student) => <tr key={student.id}><td>{student.name}</td><td>{student.email}</td><td>{student.section}</td><td>{student.blocked ? t('blocked') : '—'}</td><td><button onClick={async () => { const result = await api.blockUser(student.id, !student.blocked); if (!result.ok) toast.error(translateApiError(result.error, t)); await refresh() }}>{student.blocked ? t('unblock') : t('block')}</button></td></tr>)}</tbody></table></div>{filteredStudents.length === 0 && <p>{t('noData')}</p>}</section>}
      {tab === 'teachers' && <TeacherManagement users={users} subjects={subjects} refresh={refresh}/>}
      {tab === 'content' && <AdminContentManagement subjects={subjects} users={users} refresh={refresh}/>}
      {tab === 'sessions' && <AdminLiveManagement sessions={sessions} refresh={refresh}/>}
      {tab === 'settings' && <SettingsForm/>}
      {tab === 'relationships' && <AdminRelationshipsPage/>}
    </div>
  </section>
}

function AdminLiveManagement({ sessions, refresh }: { sessions: LiveSession[]; refresh: () => Promise<void> }) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [attendance, setAttendance] = useState<Record<string, number>>({})
  useEffect(() => {
    let active = true
    void Promise.all(sessions.map(async (session) => [session.id, await api.getLiveAttendanceCount(session.id)] as const))
      .then((counts) => { if (active) setAttendance(Object.fromEntries(counts)) })
      .catch(() => toast.error(t('unknownError')))
    return () => { active = false }
  }, [sessions, t])

  async function cancel(session: LiveSession) {
    if (session.status === 'live' && session.provider === 'livekit' && user?.role === 'admin') {
      const ended = await terminateLiveKitRoom(session, user)
      if (!ended.ok) {
        toast.error(translateApiError(ended.error, t))
        return
      }
    }
    const result = await api.cancelLiveSession(session.id)
    if (!result.ok) {
      toast.error(translateApiError(result.error, t))
      return
    }
    await refresh()
    toast.success(t('sessionCancelled'))
  }

  const ordered = [...sessions].sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime))
  return <section className="admin-table-card admin-live-sessions">
    <h2>{t('sessions')}</h2>
    {ordered.length === 0 ? <p>{t('noData')}</p> : ordered.map((session) => <article className="admin-live-session" key={session.id}>
      <div><h3>{session.title}</h3><p>{session.date} · {session.startTime} · {session.status}</p><small>{attendance[session.id] ?? 0} présences</small></div>
      {session.status !== 'cancelled' && session.status !== 'ended' && <button className="button-soft" type="button" onClick={() => void cancel(session)}>{t('cancelSession')}</button>}
    </article>)}
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
    section: z.string().trim().min(1, t('required')),
  }), [t])
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', phone: '', password: '', section: 'Mathématiques' } })
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
  const approvedStudents = users.filter((user) => user.role === 'student' && user.approvalStatus !== 'pending')
  return <section className="admin-table-card"><h2>{t('teachers')}</h2>
    <h3>Activer un professeur approuvé</h3>
    <div className="responsive-table"><table><thead><tr><th>Utilisateur approuvé</th><th>Filière</th><th>Action</th></tr></thead><tbody>{approvedStudents.map((student) => <tr key={student.id}><td>{student.name}</td><td>{student.section}</td><td><button onClick={async () => { const result = await api.setUserRole(student.id, 'teacher'); if (!result.ok) toast.error(translateApiError(result.error, t)); await refresh(); if (result.ok) toast.success('Compte professeur activé.') }}>Activer comme professeur</button></td></tr>)}</tbody></table></div>
    {approvedStudents.length === 0 && <p>Aucun utilisateur approuvé disponible.</p>}
    <h3>Créer un compte professeur</h3><form onSubmit={handleSubmit(submit)} noValidate><Field label={t('name')} error={errors.name?.message}><input {...register('name')}/></Field><Field label={t('email')} error={errors.email?.message}><input type="email" {...register('email')}/></Field><Field label={t('phone')} error={errors.phone?.message}><input {...register('phone')}/></Field><Field label={t('password')} error={errors.password?.message}><input type="password" {...register('password')}/></Field><Field label={t('section')} error={errors.section?.message}><select {...register('section')}>{sectionValues.map((section) => <option value={section} key={section}>{section}</option>)}</select></Field><button disabled={isSubmitting}>{isSubmitting ? t('loading') : t('register')}</button></form>
    <label>{t('assignSubjects')}<select value={selectedTeacher} onChange={(event) => setSelectedTeacher(event.target.value)}><option value="">{t('teachers')}</option>{teachers.map((teacher) => <option value={teacher.id} key={teacher.id}>{teacher.name}</option>)}</select></label>
    {subjects.map((subject) => <label key={subject.id}><input type="checkbox" checked={assigned.includes(subject.id)} onChange={(event) => setAssigned((current) => event.target.checked ? [...current, subject.id] : current.filter((id) => id !== subject.id))}/>{subject.titleFr}</label>)}<button onClick={() => void assign()} disabled={!selectedTeacher}>{t('assignSubjects')}</button>
  </section>
}

function SettingsForm() {
  const { t } = useLanguage()
  const schema = useMemo(() => z.object({
    monthlyPrice: z.number().positive(t('invalidSetting')),
    paymentInstructions: z.string(),
    canCreateSubjects: z.boolean(),
    paymentsEnabled: z.boolean().optional(),
    pricingScope: z.enum(['group', 'teacher', 'platform']).optional(),
    gracePeriodDays: z.number().int().min(0).max(90).optional(),
  }).superRefine((value, context) => {
    if (value.paymentsEnabled && value.paymentInstructions.trim().length < 5) {
      context.addIssue({ code: 'custom', path: ['paymentInstructions'], message: t('required') })
    }
  }), [t])
  const { control, register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<PlatformSettings>({
    resolver: zodResolver(schema),
    defaultValues: { monthlyPrice: 12, paymentInstructions: '', canCreateSubjects: true, paymentsEnabled: false, pricingScope: 'group', gracePeriodDays: 7, subscriptionScope: 'platform' },
  })
  const paymentsEnabled = useWatch({ control, name: 'paymentsEnabled' })
  useEffect(() => { void api.getSettings().then(reset) }, [reset])
  async function submit(values: PlatformSettings) {
    const result = await api.saveSettings(values)
    if (!result.ok) return toast.error(translateApiError(result.error, t))
    toast.success(t('saved'))
  }
  return <form className="settings-card" onSubmit={handleSubmit(submit)} noValidate>
    <Field label="Activer les paiements"><input type="checkbox" {...register('paymentsEnabled')}/></Field>
    {paymentsEnabled && <>
      <p>Le tarif mensuel est défini par classe. Configurez-le dans « Mes groupes ».</p>
      <Field label={t('paymentInstructions')} error={errors.paymentInstructions?.message}><textarea {...register('paymentInstructions')}/></Field>
      <Field label="Délai de grâce (jours)"><input type="number" min="0" max="90" {...register('gracePeriodDays', { valueAsNumber: true })}/></Field>
      <p>La tarification actuelle est définie par classe.</p>
    </>}
    <Field label={t('canCreateSubjects')}><input type="checkbox" {...register('canCreateSubjects')}/></Field>
    <button className="button-primary" disabled={isSubmitting}>{isSubmitting ? t('loading') : t('save')}</button>
  </form>
}

const sectionValues = ['Mathématiques', 'Sciences expérimentales', 'Technique', 'Économie et gestion', 'Informatique', 'Lettres', 'Sport']

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className="form-field">{label}{children}{error && <small role="alert">{error}</small>}</label>
}

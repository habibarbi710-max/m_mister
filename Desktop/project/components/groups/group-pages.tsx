'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CalendarDays, CreditCard, GraduationCap, Users } from 'lucide-react'
import * as api from '@/lib/api'
import type {
  BacSection,
  ClassGroup,
  GroupAnnouncement,
  GroupAttendance,
  GroupContentLink,
  GroupEnrollment,
  GroupPayment,
  Lesson,
  LiveSession,
  SchedulePoll,
  Subject,
} from '@/types'
import type { GroupStudentSummary } from '@/lib/api'
import { useAuth } from '@/components/shared/auth-provider'
import { formatLiveSessionDate, liveSessionStart } from '@/lib/live-time'

type TeacherCard = NonNullable<Awaited<ReturnType<typeof api.getTeacherProfile>>>
type GroupCardData = { group: ClassGroup; teacher?: TeacherCard; acceptedCount: number; sectionName?: string }
type StudentGroupData = {
  enrollment: GroupEnrollment
  group: ClassGroup
  lessons: Lesson[]
  announcements: GroupAnnouncement[]
  sessions: LiveSession[]
  average: number | null
  homework: Awaited<ReturnType<typeof api.getMyHomework>>
}

export function GroupDirectory() {
  const { user } = useAuth()
  const [sections, setSections] = useState<BacSection[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [cards, setCards] = useState<GroupCardData[]>([])
  const [sectionId, setSectionId] = useState(user?.sectionId ?? '')
  const [subjectId, setSubjectId] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [sectionRows, catalog, groups] = await Promise.all([
        api.listSections(), api.getSubjects(), api.listClassGroups({
          sectionId: sectionId || undefined, subjectId: subjectId || undefined,
        }),
      ])
      const results = await Promise.all(groups.map(async (group) => {
        const [teacher, acceptedCount] = await Promise.all([
          api.getTeacherProfile(group.teacherId), api.getAcceptedGroupCount(group.id),
        ])
        return {
          group, teacher, acceptedCount,
          sectionName: sectionRows.find((section) => section.id === group.sectionId)?.name,
        }
      }))
      setSections(sectionRows)
      setSubjects(catalog)
      setCards(results)
      setError('')
    } catch {
      setError('Impossible de charger les classes. Réessayez.')
    } finally {
      setLoading(false)
    }
  }, [sectionId, subjectId])
  useEffect(() => { void refresh() }, [refresh])
  const visibleCards = useMemo(() => cards.filter(({ group, teacher }) =>
    !query || `${group.name} ${group.description} ${teacher?.name ?? ''} ${teacher?.specialties.join(' ') ?? ''}`
      .toLocaleLowerCase('fr-FR').includes(query.toLocaleLowerCase('fr-FR'))), [cards, query])
  return <section className="app-page">
    <header className="page-heading"><div><p className="section-kicker">Classes du Baccalauréat</p><h1>Trouver un professeur</h1>
      <p>Choisissez une classe selon votre filière et la matière à travailler.</p></div></header>
    <div className="catalog-toolbar group-filters">
      <label className="form-field">Filière<select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
        <option value="">Toutes les filières</option>{sections.map((section) => <option value={section.id} key={section.id}>{section.name}</option>)}
      </select></label>
      <label className="form-field">Matière<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
        <option value="">Toutes les matières</option>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.titleFr}</option>)}
      </select></label>
      <label className="form-field">Rechercher<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Classe ou professeur"/></label>
    </div>
    {error && <p role="alert">{error}</p>}
    {loading ? <p role="status">Chargement des classes…</p>
      : visibleCards.length === 0 ? <div className="empty-state"><GraduationCap aria-hidden="true"/><h2>Aucune classe trouvée</h2>
        <p>Essayez une autre filière ou une autre matière.</p></div>
        : <div className="group-card-grid">{visibleCards.map((card) => <GroupCard key={card.group.id} {...card}/>)}</div>}
  </section>
}

function GroupCard({ group, teacher, acceptedCount, sectionName }: GroupCardData) {
  const remaining = Math.max(0, group.maxStudents - acceptedCount)
  return <article className="group-card">
    <p className="section-kicker">{group.status} · emploi du temps {group.scheduleStatus}</p>
    <h2>{group.name}</h2><p>{group.description}</p>
    <div className="group-teacher">{teacher?.photoUrl
      ? <Image className="group-avatar" src={teacher.photoUrl} alt="" width={40} height={40} unoptimized/>
      : <span className="group-avatar" aria-hidden="true">{teacher?.name.slice(0, 1) ?? 'P'}</span>}
      <span><strong>{teacher?.name ?? 'Professeur EduBac'}</strong><small>{teacher?.specialties.join(' · ') || 'Enseignant du Bac'}</small></span></div>
    <p>{sectionName ?? 'Filière du Bac'}</p>
    <p className="group-capacity"><Users aria-hidden="true"/> {remaining} place{remaining === 1 ? '' : 's'} disponible{remaining === 1 ? '' : 's'}</p>
    {group.monthlyPrice !== null && <p>{group.monthlyPrice > 0 ? `${group.monthlyPrice} TND par mois` : 'Gratuit'}</p>}
    <Link className="button-soft" href={`/groups/${group.id}`}>Voir la classe</Link>
  </article>
}

export function GroupDetailPage({ groupId }: { groupId: string }) {
  const { user } = useAuth()
  const [card, setCard] = useState<GroupCardData>()
  const [previews, setPreviews] = useState<Lesson[]>([])
  const [enrollment, setEnrollment] = useState<GroupEnrollment>()
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    void Promise.all([
      api.getClassGroup(groupId), api.getGroupPreviewLessons(groupId),
      api.getMyGroupEnrollments(), api.getAcceptedGroupCount(groupId),
    ]).then(async ([group, lessons, mine, acceptedCount]) => {
      if (!active || !group) return
      const teacher = await api.getTeacherProfile(group.teacherId)
      const sections = await api.listSections()
      if (!active) return
      setCard({ group, teacher, acceptedCount, sectionName: sections.find((section) => section.id === group.sectionId)?.name })
      setPreviews(lessons)
      setEnrollment(mine.find((item) => item.group.id === groupId)?.enrollment)
    }).catch(() => toast.error('Impossible de charger cette classe.'))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [groupId])
  async function requestJoin() {
    const result = await api.requestGroupEnrollment(groupId)
    if (!result.ok) return toast.error(result.error)
    setEnrollment(result.data)
    toast.success('Votre demande a été envoyée au professeur.')
  }
  if (loading) return <section className="app-page"><p role="status">Chargement de la classe…</p></section>
  if (!card) return <section className="app-page"><div className="empty-state"><h1>Classe introuvable</h1><Link href="/groups">Retour aux classes</Link></div></section>
  const { group, teacher, acceptedCount } = card
  const canJoin = user?.role === 'student' && group.status === 'ouvert aux inscriptions'
    && !['accepté', 'en attente'].includes(enrollment?.status ?? '')
  return <section className="app-page">
    <Link className="text-link" href="/groups">← Toutes les classes</Link>
    <header className="page-heading"><div><p className="section-kicker">{group.status} · {group.scheduleStatus}</p><h1>{group.name}</h1>
      <p>{group.description}</p></div></header>
    <article className="group-detail-card">
      <div className="group-teacher"><span className="group-avatar" aria-hidden="true">{teacher?.name.slice(0, 1) ?? 'P'}</span>
        <span><strong>{teacher?.name ?? 'Professeur EduBac'}</strong><small>{teacher?.bio || 'Enseignant du Baccalauréat tunisien.'}</small></span></div>
      <p>Filière : {card.sectionName} · Places : {Math.max(0, group.maxStudents - acceptedCount)}</p>
      {group.monthlyPrice !== null && <p>{group.monthlyPrice > 0 ? `${group.monthlyPrice} TND par mois` : 'Gratuit'}</p>}
      {enrollment?.status === 'accepté' && <p role="status">Votre demande est acceptée.</p>}
      {enrollment?.status === 'en attente' && <p role="status">Votre demande est en attente de réponse du professeur.</p>}
      {canJoin && <button className="button-primary" type="button" onClick={() => void requestJoin()}>Demander à rejoindre</button>}
      {!user && <Link className="button-primary" href={`/login?return=${encodeURIComponent(`/groups/${group.id}`)}`}>Connectez-vous pour demander à rejoindre</Link>}
      {user?.role === 'student' && group.status !== 'ouvert aux inscriptions' && !enrollment && <p>Cette classe n’accepte plus de demandes.</p>}
    </article>
    <section className="admin-table-card"><h2>Leçons gratuites de découverte</h2>
      {previews.length ? previews.map((lesson) => <p className="group-detail-preview-link" key={lesson.id}><Link href={`/lessons/${lesson.id}`}>{lesson.title}</Link></p>)
        : <p>Aucune leçon gratuite n’est proposée pour cette classe.</p>}
    </section>
  </section>
}

export function StudentGroupsPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<StudentGroupData[]>([])
  const [paymentsEnabled, setPaymentsEnabled] = useState(false)
  const [paymentInstructions, setPaymentInstructions] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    if (!user) return
    try {
      const [enrollments, sessions, homework, settings] = await Promise.all([
        api.getMyGroupEnrollments(), api.getLiveSessions(), api.getMyHomework(), api.getSettings(),
      ])
      const details = await Promise.all(enrollments.map(async ({ enrollment, group }) => {
        if (enrollment.status !== 'accepté') return {
          enrollment, group, lessons: [], announcements: [], sessions: [], average: null, homework: [],
        }
        const [lessons, announcements, grades] = await Promise.all([
          api.getGroupLessons(group.id), api.getGroupAnnouncements(group.id), api.getGroupGrades(group.id),
        ])
        return {
          enrollment, group, lessons, announcements,
          sessions: sessions.filter((session) => session.groupId === group.id),
          average: grades?.average ?? null,
          homework: homework.filter((item) => item.assignment.groupId === group.id),
        }
      }))
      setRows(details)
      setPaymentsEnabled(settings.paymentsEnabled === true)
      setPaymentInstructions(settings.paymentInstructions)
      setError('')
    } catch {
      setError('Impossible de charger vos classes.')
    } finally {
      setLoading(false)
    }
  }, [user])
  useEffect(() => { void refresh() }, [refresh])
  async function leave(groupId: string) {
    if (!window.confirm('Voulez-vous vraiment quitter cette classe ?')) return
    const result = await api.leaveClassGroup(groupId)
    if (!result.ok) return toast.error(result.error)
    await refresh()
    toast.success('Vous avez quitté la classe.')
  }
  async function reportAnnouncement(announcementId: string) {
    const reason = window.prompt('Pourquoi souhaitez-vous signaler cette annonce ?')
    if (reason === null) return
    const result = await api.createReport('announcement', announcementId, reason)
    if (!result.ok) return toast.error(result.error)
    toast.success('Votre signalement a été transmis à la modération.')
  }
  return <section className="app-page">
    <header className="page-heading"><div><p className="section-kicker">Espace élève</p><h1>Mes classes</h1><p>Retrouvez les annonces, les cours, les devoirs et les notes de vos classes.</p></div>
      <Link className="button-primary" href="/groups">Trouver une classe</Link></header>
    {error && <p role="alert">{error}</p>}
    {loading ? <p role="status">Chargement de vos classes…</p>
      : rows.length === 0 ? <div className="empty-state"><GraduationCap aria-hidden="true"/><h2>Vous n’avez pas encore de classe</h2>
        <Link className="button-primary" href="/groups">Trouver un professeur</Link></div>
        : <div className="group-student-list">{rows.map((row) => <article className="group-student-card" key={row.group.id}>
          <div className="group-card-heading"><div><p className="section-kicker">{row.enrollment.status}</p><h2>{row.group.name}</h2></div>
            <button type="button" className="button-soft" onClick={() => void leave(row.group.id)}>Quitter la classe</button></div>
          {row.enrollment.status === 'en attente' ? <p>Le professeur étudie votre demande. {row.enrollment.decisionReason}</p> : <>
            <p>Emploi du temps : {row.group.scheduleStatus}</p>
            {row.sessions.find((session) => session.status === 'scheduled') &&
              <p>Prochaine séance : {formatLiveSessionDate(row.sessions.find((session) => session.status === 'scheduled')!)}</p>}
            {paymentsEnabled && row.group.monthlyPrice !== null && row.group.monthlyPrice > 0 &&
              <GroupPaymentPanel groupId={row.group.id} monthlyPrice={row.group.monthlyPrice} instructions={paymentInstructions}/>}
            {row.average !== null && <p>Moyenne actuelle : {row.average}/20</p>}
            <h3>Annonces</h3>{row.announcements.length ? row.announcements.map((item) => <article className="relationship-post" key={item.id}>
              <h4>{item.title}</h4><p>{item.body}</p>
              <button className="button-soft" type="button" onClick={() => void reportAnnouncement(item.id)}>Signaler</button>
            </article>) : <p>Aucune annonce pour le moment.</p>}
            <h3>Contenu de la classe</h3>{row.lessons.length ? row.lessons.map((lesson) => <p className="group-content-lesson" key={lesson.id}><Link href={`/lessons/${lesson.id}`}>{lesson.title}</Link></p>) : <p>Les leçons de la classe apparaîtront ici.</p>}
            <p className="group-inline-links"><Link href="/student/homework">Mes devoirs</Link><Link href="/student/record">Mon dossier</Link><Link href="/student/schedule">Mon emploi du temps</Link></p>
          </>}
        </article>)}</div>}
  </section>
}

function GroupPaymentPanel({ groupId, monthlyPrice, instructions }: { groupId: string; monthlyPrice: number; instructions: string }) {
  const [payments, setPayments] = useState<GroupPayment[]>([])
  const [receipt, setReceipt] = useState<File>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [period, setPeriod] = useState('')
  const refresh = useCallback(async () => {
    setPayments(await api.getMyGroupPayments(groupId))
    setLoading(false)
  }, [groupId])
  useEffect(() => { setPeriod(currentTunisPeriod()) }, [])
  useEffect(() => { void refresh().catch(() => {
    toast.error('Impossible de charger le statut du paiement.')
    setLoading(false)
  }) }, [refresh])
  const currentPayment = payments.find((payment) => payment.period === period)
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!receipt || receipt.size > 3 * 1024 * 1024
      || !['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(receipt.type)) {
      return toast.error('Choisissez une image ou un PDF de 3 Mo maximum.')
    }
    setSaving(true)
    try {
      const data = await fileToDataUrl(receipt)
      const result = await api.submitGroupPayment(groupId, period, data, receipt.type)
      if (!result.ok) return toast.error(result.error)
      await refresh()
      setReceipt(undefined)
      toast.success('Votre reçu a été transmis à l’administration.')
    } catch {
      toast.error('Impossible de transmettre le reçu.')
    } finally {
      setSaving(false)
    }
  }
  return <section className="group-payment-panel">
    <h3><CreditCard aria-hidden="true"/> Paiement mensuel</h3>
    <p>{monthlyPrice} TND · période {period}</p>
    {instructions && <p className="group-payment-instructions">{instructions}</p>}
    {loading || !period ? <p role="status">Chargement du statut…</p> : <>
      <p>Statut : {currentPayment?.status ?? 'aucun reçu transmis'}</p>
      {currentPayment?.status !== 'payé' && <form onSubmit={(event) => void submit(event)}>
        <label className="form-field">Reçu (image ou PDF, 3 Mo maximum)<input type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          onChange={(event) => setReceipt(event.target.files?.[0])}/></label>
        <button className="button-soft" disabled={saving || !receipt || !period}>{saving ? 'Envoi…' : 'Transmettre le reçu'}</button>
      </form>}
    </>}
  </section>
}

function currentTunisPeriod(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Tunis', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}`
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Conversion impossible'))
    reader.onerror = () => reject(new Error('Lecture impossible'))
    reader.readAsDataURL(file)
  })
}

export function StudentRecordPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<Array<{ group: ClassGroup; detail: Awaited<ReturnType<typeof api.getGroupStudentDetail>> }>>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    void api.getMyGroupEnrollments().then(async (rows) => {
      const details = await Promise.all(rows.filter((item) => item.enrollment.status === 'accepté')
        .map(async ({ group }) => ({ group, detail: await api.getGroupStudentDetail(group.id, user?.id ?? '') })))
      if (active) setItems(details)
    }).catch(() => toast.error('Impossible de charger votre dossier.'))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [user?.id])
  return <section className="app-page">
    <header className="page-heading"><div><p className="section-kicker">Suivi de l’année</p><h1>Mon dossier</h1>
      <p>Présences, cahier de textes et notes de vos classes.</p></div></header>
    {loading ? <p role="status">Chargement de votre dossier…</p>
      : items.length === 0 ? <div className="empty-state"><h2>Aucune activité à afficher</h2><p>Rejoignez une classe pour commencer votre suivi.</p></div>
        : items.map(({ group, detail }) => <section className="admin-table-card" key={group.id}>
          <h2>{group.name}</h2>
          <h3>Présences</h3>{detail?.attendance.length ? detail.attendance.map((entry) => <p key={`${entry.sessionId}-${entry.studentId}`}>{entry.sessionId} · {entry.status}</p>) : <p>Aucune présence enregistrée.</p>}
          <h3>Cahier de textes</h3>{detail?.classLog.length ? detail.classLog.map((entry) => <p key={entry.id}>{new Date(entry.createdAt).toLocaleDateString('fr-FR')} · {entry.summary}</p>) : <p>Aucune séance clôturée.</p>}
          <h3>Notes</h3>{detail?.grades.length ? detail.grades.map(({ assessment, grade }) => <p key={grade.id}>{assessment.title} · {grade.absent ? 'Absent' : `${grade.score ?? '—'}/${assessment.maxPoints}`}</p>) : <p>Aucune note publiée.</p>}
        </section>)}
  </section>
}

export function StudentSchedulePage() {
  const [polls, setPolls] = useState<Array<{ poll: SchedulePoll; groupName: string; votes: Awaited<ReturnType<typeof api.getMyOpenSchedulePolls>>[number]['votes'] }>>([])
  const [sessions, setSessions] = useState<LiveSession[]>([])
  const [conflicts, setConflicts] = useState<Awaited<ReturnType<typeof api.getStudentScheduleConflicts>>>([])
  const [roomAccess, setRoomAccess] = useState<Record<string, boolean>>({})
  const [now, setNow] = useState(0)
  const refresh = useCallback(async () => {
    const [pollRows, sessionRows, conflictRows] = await Promise.all([
      api.getMyOpenSchedulePolls(), api.getLiveSessions(), api.getStudentScheduleConflicts(),
    ])
    setPolls(pollRows)
    setSessions(sessionRows.filter((item) => item.groupId).sort((a, b) => liveSessionStart(a).getTime() - liveSessionStart(b).getTime()))
    setConflicts(conflictRows)
    const access = await Promise.all(sessionRows.filter((item) => item.groupId).map(async (item) =>
      [item.id, await api.canJoinLiveSession(item.id)] as const))
    setRoomAccess(Object.fromEntries(access))
  }, [])
  useEffect(() => {
    setNow(Date.now())
    void refresh().catch(() => toast.error('Impossible de charger votre emploi du temps.'))
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [refresh])
  async function vote(pollId: string, slotId: string, value: 'Disponible' | 'Si nécessaire' | 'Indisponible') {
    const result = await api.submitScheduleVote(pollId, slotId, value)
    if (!result.ok) return toast.error(result.error)
    await refresh()
    toast.success('Votre disponibilité a été enregistrée.')
  }
  return <section className="app-page">
    <header className="page-heading"><div><p className="section-kicker">Séances hebdomadaires</p><h1>Mon emploi du temps</h1>
      <p>Répondez aux propositions et retrouvez les prochaines séances.</p></div>
      <div className="group-actions"><button className="button-soft" type="button" onClick={() => downloadCalendar(sessions)}>Exporter en .ics</button><button className="button-soft" type="button" onClick={() => window.print()}>Imprimer</button></div>
    </header>
    {polls.map(({ poll, groupName, votes }) => <section className="admin-table-card" key={poll.id}>
      <h2>Choisir mes disponibilités · {groupName}</h2><p>Réponse avant le {new Date(poll.deadlineAt).toLocaleString('fr-FR')}</p>
      <div className="group-slot-list">{poll.slots.map((slot) => <div className="group-slot-row" key={slot.id}>
        <strong>{weekdayName(slot.dayOfWeek)} · {slot.startTime} ({slot.durationMinutes} min)</strong>
        <div className="group-actions">{(['Disponible', 'Si nécessaire', 'Indisponible'] as const).map((value) =>
          <button type="button" className={votes.find((vote) => vote.slotId === slot.id)?.vote === value ? 'button-primary' : 'button-soft'}
            key={value} onClick={() => void vote(poll.id, slot.id, value)}>{value}</button>)}</div>
      </div>)}</div>
    </section>)}
    {sessions.map((session) => {
      const opensAt = liveSessionStart(session).getTime() - 15 * 60_000
      const canEnter = roomAccess[session.id] && now >= opensAt && session.status !== 'cancelled' && session.status !== 'ended'
      const conflict = conflicts.find((item) => item.sessionId === session.id)
      return <SessionCard key={session.id} session={session} conflict={conflict?.groupName} canEnter={Boolean(canEnter)}/>
    })}
    {polls.length === 0 && sessions.length === 0 && <div className="empty-state"><CalendarDays aria-hidden="true"/><h2>Aucune séance prévue</h2><p>Les propositions de vos professeurs apparaîtront ici.</p></div>}
  </section>
}

function SessionCard({ session, conflict, canEnter }: { session: LiveSession; conflict?: string; canEnter: boolean }) {
  const [reason, setReason] = useState('')
  const [proposedDate, setProposedDate] = useState('')
  const [proposedStartTime, setProposedStartTime] = useState('')
  const [asking, setAsking] = useState(false)
  return <article className="group-session-card">
    <p className="section-kicker">{session.status === 'ended' ? 'Terminée' : session.status === 'cancelled' ? 'Annulée' : formatLiveSessionDate(session)}</p>
    <h2>{session.title}</h2>
    {conflict && <p className="group-warning" role="status">Attention : cette séance chevauche celle de « {conflict} ».</p>}
    {canEnter && <Link className="button-primary" href={`/live/${session.id}`}>Rejoindre</Link>}
    {!canEnter && session.status === 'scheduled' && <p>La salle ouvre 15 minutes avant le début.</p>}
    {!asking ? <button className="button-soft" type="button" onClick={() => setAsking(true)}>Demander un changement</button>
      : <form onSubmit={async (event) => {
        event.preventDefault()
        const result = await api.requestGroupReschedule(session.id, reason, proposedDate || undefined, proposedStartTime || undefined)
        if (!result.ok) return toast.error(result.error)
        setAsking(false)
        setReason('')
        setProposedDate('')
        setProposedStartTime('')
        toast.success('Votre demande a été envoyée au professeur.')
      }}>
        <label className="form-field">Motif<textarea required minLength={5} value={reason} onChange={(event) => setReason(event.target.value)}/></label>
        <p>Vous pouvez suggérer un autre créneau ; le professeur doit le confirmer.</p>
        <label className="form-field">Date proposée<input type="date" value={proposedDate} onChange={(event) => setProposedDate(event.target.value)}/></label>
        <label className="form-field">Heure proposée<input type="time" value={proposedStartTime} onChange={(event) => setProposedStartTime(event.target.value)}/></label>
        <button className="button-primary" type="submit">Envoyer la demande</button>
      </form>}
  </article>
}

function weekdayName(day: number): string {
  return ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][day] ?? 'Jour'
}

function downloadCalendar(sessions: LiveSession[]) {
  const events = sessions.filter((session) => session.status !== 'cancelled').map((session) => {
    const start = `${session.date.replace(/-/g, '')}T${session.startTime.replace(':', '')}00`
    const endDate = new Date(`${session.date}T${session.startTime}:00Z`)
    endDate.setUTCMinutes(endDate.getUTCMinutes() + session.durationMinutes)
    const end = `${endDate.toISOString().slice(0, 10).replace(/-/g, '')}T${String(endDate.getUTCHours()).padStart(2, '0')}${String(endDate.getUTCMinutes()).padStart(2, '0')}00`
    return `BEGIN:VEVENT\nUID:${session.id}@edubac\nDTSTART;TZID=Africa/Tunis:${start}\nDTEND;TZID=Africa/Tunis:${end}\nSUMMARY:${session.title.replace(/[,;]/g, '\\$&')}\nEND:VEVENT`
  })
  const blob = new Blob([`BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//EduBac//Emploi du temps//FR\n${events.join('\n')}\nEND:VCALENDAR`], { type: 'text/calendar;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = 'emploi-du-temps-edubac.ics'
  anchor.click()
  URL.revokeObjectURL(href)
}

export function TeacherGroupsPage() {
  const { user } = useAuth()
  const [groups, setGroups] = useState<ClassGroup[]>([])
  const [sections, setSections] = useState<BacSection[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [ownLessons, setOwnLessons] = useState<Lesson[]>([])
  const [teachingSubjectIds, setTeachingSubjectIds] = useState<string[]>([])
  const [requests, setRequests] = useState<Awaited<ReturnType<typeof api.getTeacherGroupRequests>>>([])
  const [polls, setPolls] = useState<Awaited<ReturnType<typeof api.getTeacherSchedulePolls>>>([])
  const [students, setStudents] = useState<Record<string, GroupStudentSummary[]>>({})
  const [sessions, setSessions] = useState<LiveSession[]>([])
  const [paymentsEnabled, setPaymentsEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [capacity, setCapacity] = useState(8)
  const [price, setPrice] = useState('')
  const [editingGroupId, setEditingGroupId] = useState('')
  const refresh = useCallback(async () => {
    try {
      const [groupRows, sectionRows, catalog, lessons, subjectIds, requestsRows, pollRows, liveSessions, settings] = await Promise.all([
        api.listClassGroups(), api.listSections(), api.getSubjects(), api.getTeacherLessons(),
        api.getMyTeachingSubjectIds(), api.getTeacherGroupRequests(), api.getTeacherSchedulePolls(), api.getLiveSessions(), api.getSettings(),
      ])
      setGroups(groupRows)
      setSections(sectionRows)
      setSubjects(catalog)
      setOwnLessons(lessons)
      setTeachingSubjectIds(subjectIds)
      setRequests(requestsRows)
      setPolls(pollRows)
      setSessions(liveSessions.filter((session) => session.groupId))
      setPaymentsEnabled(settings.paymentsEnabled === true)
      const rosters = await Promise.all(groupRows.map(async (group) =>
        [group.id, await api.getTeacherGroupStudents(group.id)] as const))
      setStudents(Object.fromEntries(rosters))
    } catch {
      toast.error('Impossible de charger vos classes.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  const availableSubjects = subjects.filter((subject) => teachingSubjectIds.includes(subject.id))
  async function createGroup(event: React.FormEvent) {
    event.preventDefault()
    const result = await api.createClassGroup({
      name, sectionId, subjectId, maxStudents: capacity, description,
      monthlyPrice: paymentsEnabled && price.trim() ? Number(price) : null,
      status: 'ouvert aux inscriptions',
    })
    if (!result.ok) return toast.error(result.error)
    setName('')
    setDescription('')
    setPrice('')
    await refresh()
    toast.success('La classe a été créée.')
  }
  async function decide(enrollmentId: string, decision: 'accepté' | 'refusé') {
    const reason = decision === 'refusé' ? window.prompt('Motif du refus') ?? '' : ''
    const result = await api.decideGroupEnrollment(enrollmentId, decision, reason)
    if (!result.ok) return toast.error(result.error)
    await refresh()
    toast.success(decision === 'accepté' ? 'Inscription acceptée.' : 'Demande refusée.')
  }
  return <section className="app-page">
    <header className="page-heading"><div><p className="section-kicker">Espace enseignant</p><h1>Mes groupes</h1>
      <p>Créez vos classes, gérez les inscriptions et organisez les séances.</p></div></header>
    <section className="admin-table-card"><h2>Créer une classe</h2>
      <form className="group-form-grid" onSubmit={(event) => void createGroup(event)}>
        <label className="form-field">Nom de la classe<input required minLength={3} value={name} onChange={(event) => setName(event.target.value)} placeholder="Bac Mathématiques - Math"/></label>
        <label className="form-field">Filière<select required value={sectionId} onChange={(event) => setSectionId(event.target.value)}><option value="">Choisir une filière</option>{sections.map((section) => <option value={section.id} key={section.id}>{section.name}</option>)}</select></label>
        <label className="form-field">Matière<select required value={subjectId} onChange={(event) => setSubjectId(event.target.value)}><option value="">Choisir une matière</option>{availableSubjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.titleFr}</option>)}</select></label>
        <label className="form-field">Nombre maximal d’élèves<input type="number" min="1" max="200" value={capacity} onChange={(event) => setCapacity(Number(event.target.value))}/></label>
        {paymentsEnabled && <label className="form-field">Prix mensuel (TND)<input type="number" min="0" step="0.1" value={price} onChange={(event) => setPrice(event.target.value)}/></label>}
        <label className="form-field group-form-wide">Description<textarea maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)}/></label>
        <button className="button-primary" type="submit">Créer la classe</button>
      </form>
    </section>
    <section className="admin-table-card"><h2>Demandes d’inscription</h2>
      {requests.length ? requests.map(({ enrollment, groupName, studentName, section }) => <article className="group-request-row" key={enrollment.id}>
        <div><strong>{studentName}</strong><span>{section} · {groupName}</span></div>
        {enrollment.decisionReason && <small>{enrollment.decisionReason}</small>}
        <button className="button-primary" type="button" onClick={() => void decide(enrollment.id, 'accepté')}>Accepter</button>
        <button className="button-soft" type="button" onClick={() => void decide(enrollment.id, 'refusé')}>Refuser</button>
      </article>) : <p>Aucune demande en attente.</p>}
    </section>
    {loading ? <p role="status">Chargement de vos groupes…</p>
      : groups.length === 0 ? <div className="empty-state"><h2>Vous n’avez pas encore de groupe</h2><p>Créez votre première classe pour commencer.</p></div>
        : <div className="group-student-list">{groups.map((group) => {
          const ownModules = subjects.find((subject) => subject.id === group.subjectId)?.chapters
            .filter((chapter) => chapter.ownerId === user?.id && ownLessons.some((lesson) => lesson.chapterId === chapter.id)) ?? []
          const groupPolls = polls.filter((item) => item.poll.groupId === group.id && item.poll.status === 'ouvert')
          return <article className="group-student-card" key={group.id}>
            <div className="group-card-heading"><div><p className="section-kicker">{group.status} · horaire {group.scheduleStatus}</p><h2>{group.name}</h2></div>
              <div className="group-actions">
                <button className="button-soft" type="button" onClick={async () => { const result = await api.duplicateClassGroup(group.id); if (!result.ok) toast.error(result.error); else await refresh() }}>Dupliquer</button>
                <button className="button-soft" type="button" onClick={async () => { const result = await api.updateClassGroup(group.id, { status: group.status === 'fermé' ? 'ouvert aux inscriptions' : 'fermé' }); if (!result.ok) toast.error(result.error); else await refresh() }}>{group.status === 'fermé' ? 'Rouvrir' : 'Fermer'}</button>
              </div></div>
            <p>{group.description}</p>
            {group.monthlyPrice !== null && <p>{group.monthlyPrice > 0 ? `${group.monthlyPrice} TND par mois` : 'Gratuit'}</p>}
            <p>{students[group.id]?.length ?? 0} / {group.maxStudents} élèves inscrits</p>
            <button className="button-soft" type="button" onClick={() =>
              setEditingGroupId((current) => current === group.id ? '' : group.id)}>Modifier la classe</button>
            {editingGroupId === group.id && <EditGroupForm group={group} paymentsEnabled={paymentsEnabled}
              refresh={refresh} onCancel={() => setEditingGroupId('')}/>}
            <h3>Mes élèves</h3>
            {students[group.id]?.length ? <div className="group-roster">{students[group.id].map((student) => <StudentSummary key={student.studentId} student={student}/>)}</div> : <p>Aucun élève accepté pour le moment.</p>}
            <ContentLinkForm group={group} modules={ownModules} ownLessons={ownLessons} refresh={refresh}/>
            <GroupContentOrder group={group}/>
            <SchedulePollForm group={group} refresh={refresh}/>
            {groupPolls.map(({ poll }) => <PollResults key={poll.id} poll={poll} refresh={refresh}/>)}
            <GroupAssessments group={group} students={students[group.id] ?? []} refresh={refresh}/>
            <GroupSessionTools group={group} sessions={sessions.filter((session) => session.groupId === group.id)} refresh={refresh}/>
            <AnnouncementForm groupId={group.id} refresh={refresh}/>
          </article>
        })}</div>}
  </section>
}

function EditGroupForm({ group, paymentsEnabled, refresh, onCancel }: {
  group: ClassGroup
  paymentsEnabled: boolean
  refresh: () => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description)
  const [maxStudents, setMaxStudents] = useState(group.maxStudents)
  const [monthlyPrice, setMonthlyPrice] = useState(group.monthlyPrice?.toString() ?? '')
  const [status, setStatus] = useState(group.status)
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const result = await api.updateClassGroup(group.id, {
      name, description, maxStudents, status,
      ...(paymentsEnabled ? { monthlyPrice: monthlyPrice.trim() ? Number(monthlyPrice) : null } : {}),
    })
    if (!result.ok) return toast.error(result.error)
    await refresh()
    onCancel()
    toast.success('La classe a été mise à jour.')
  }
  return <form className="group-form-grid group-subform" onSubmit={(event) => void submit(event)}>
    <h3>Modifier la classe</h3>
    <label className="form-field">Nom<input required minLength={3} value={name} onChange={(event) => setName(event.target.value)}/></label>
    <label className="form-field">Capacité<input type="number" min="1" max="200" value={maxStudents} onChange={(event) => setMaxStudents(Number(event.target.value))}/></label>
    <label className="form-field">Statut<select value={status} onChange={(event) => setStatus(event.target.value as ClassGroup['status'])}>
      <option value="ouvert aux inscriptions">Ouvert aux inscriptions</option><option value="complet">Complet</option><option value="fermé">Fermé</option>
    </select></label>
    {paymentsEnabled && <label className="form-field">Prix mensuel (TND)<input type="number" min="0" step="0.1" value={monthlyPrice}
      onChange={(event) => setMonthlyPrice(event.target.value)}/></label>}
    <label className="form-field group-form-wide">Description<textarea maxLength={2000} value={description}
      onChange={(event) => setDescription(event.target.value)}/></label>
    <div className="group-actions"><button className="button-primary">Enregistrer</button>
      <button className="button-soft" type="button" onClick={onCancel}>Annuler</button></div>
  </form>
}

function StudentSummary({ student }: { student: GroupStudentSummary }) {
  return <article className="group-roster-card">
    <strong>{student.name}</strong><span>{student.section}</span><span>Progression {student.progressPercent}%</span>
    <span>Présence {student.attendanceRate === null ? '—' : `${student.attendanceRate}%`}</span>
    <span>Moyenne {student.averageGrade === null ? '—' : `${student.averageGrade}/20`}</span>
    <span>Activité {student.lastActivityAt ? new Date(student.lastActivityAt).toLocaleDateString('fr-FR') : '—'}</span>
  </article>
}

function ContentLinkForm({ group, modules, ownLessons, refresh }: {
  group: ClassGroup
  modules: NonNullable<Subject['chapters']>
  ownLessons: Lesson[]
  refresh: () => Promise<void>
}) {
  const [moduleId, setModuleId] = useState(modules[0]?.id ?? '')
  const [selectedLessons, setSelectedLessons] = useState<string[]>([])
  const currentModuleLessons = ownLessons.filter((lesson) => lesson.chapterId === moduleId)
  async function link(event: React.FormEvent) {
    event.preventDefault()
    const result = await api.linkGroupModule(group.id, moduleId, selectedLessons)
    if (!result.ok) return toast.error(result.error)
    const published = await api.setGroupContentPublished(result.data.id, true)
    if (!published.ok) return toast.error(published.error)
    setSelectedLessons([])
    await refresh()
    toast.success('Le contenu a été publié dans la classe.')
  }
  if (!modules.length) return <p>Ajoutez d’abord un module à votre matière pour le lier à cette classe.</p>
  return <form className="group-subform" onSubmit={(event) => void link(event)}>
    <h3>Lier mes leçons</h3>
    <label className="form-field">Module<select value={moduleId} onChange={(event) => { setModuleId(event.target.value); setSelectedLessons([]) }}>
      {modules.map((module) => <option value={module.id} key={module.id}>{module.title}</option>)}
    </select></label>
    <div className="group-checkbox-list">{currentModuleLessons.map((lesson) => <label key={lesson.id}>
      <input type="checkbox" checked={selectedLessons.includes(lesson.id)} onChange={(event) =>
        setSelectedLessons((current) => event.target.checked ? [...current, lesson.id] : current.filter((id) => id !== lesson.id))}/>
      {lesson.title}
    </label>)}</div>
    <button className="button-soft" disabled={selectedLessons.length === 0}>Publier dans le groupe</button>
  </form>
}

function GroupContentOrder({ group }: { group: ClassGroup }) {
  const [links, setLinks] = useState<GroupContentLink[]>([])
  const [moduleTitles, setModuleTitles] = useState<Record<string, string>>({})
  const load = useCallback(async () => {
    const [contentLinks, subjects] = await Promise.all([api.getTeacherGroupContentLinks(group.id), api.getSubjects()])
    setLinks(contentLinks)
    const modules = subjects.find((subject) => subject.id === group.subjectId)?.chapters ?? []
    setModuleTitles(Object.fromEntries(modules.map((module) => [module.id, module.title])))
  }, [group.id, group.subjectId])
  useEffect(() => { void load().catch(() => toast.error('Impossible de charger l’ordre du contenu.')) }, [load])
  async function move(index: number, offset: -1 | 1) {
    const next = [...links]
    const target = index + offset
    if (target < 0 || target >= next.length) return
    const current = next[index]
    next[index] = next[target]
    next[target] = current
    const result = await api.reorderGroupContent(group.id, next.map((item) => item.id))
    if (!result.ok) return toast.error(result.error)
    setLinks(result.data)
  }
  async function togglePublished(link: GroupContentLink) {
    const result = await api.setGroupContentPublished(link.id, !link.published)
    if (!result.ok) return toast.error(result.error)
    setLinks((current) => current.map((item) => item.id === link.id ? result.data : item))
  }
  if (!links.length) return null
  return <section className="group-subform">
    <h3>Ordre et publication des modules</h3>
    {links.map((link, index) => <div className="group-content-order-row" key={link.id}>
      <strong>{moduleTitles[link.moduleId] ?? 'Module'} · {link.lessonIds.length} leçon(s)</strong>
      <span>{link.published ? 'Publié' : 'Brouillon'}</span>
      <div className="group-actions">
        <button className="button-soft" type="button" aria-label="Monter le module" disabled={index === 0} onClick={() => void move(index, -1)}>↑</button>
        <button className="button-soft" type="button" aria-label="Descendre le module" disabled={index === links.length - 1} onClick={() => void move(index, 1)}>↓</button>
        <button className="button-soft" type="button" onClick={() => void togglePublished(link)}>
          {link.published ? 'Dépublier' : 'Publier'}
        </button>
      </div>
    </div>)}
  </section>
}

function SchedulePollForm({ group, refresh }: { group: ClassGroup; refresh: () => Promise<void> }) {
  const [deadlineAt, setDeadlineAt] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16))
  const [weeks, setWeeks] = useState(12)
  const [slots, setSlots] = useState([
    { dayOfWeek: 0, startTime: '17:00', durationMinutes: 90 },
    { dayOfWeek: 2, startTime: '19:00', durationMinutes: 90 },
    { dayOfWeek: 4, startTime: '18:00', durationMinutes: 90 },
  ])
  async function propose(event: React.FormEvent) {
    event.preventDefault()
    const result = await api.createSchedulePoll(group.id,
      slots.map((slot, index) => ({ ...slot, id: `slot-${index + 1}` })),
      new Date(deadlineAt).toISOString(), weeks)
    if (!result.ok) return toast.error(result.error)
    await refresh()
    toast.success('Les créneaux ont été proposés aux élèves.')
  }
  return <form className="group-subform" onSubmit={(event) => void propose(event)}>
    <h3>Proposer des créneaux hebdomadaires</h3>
    {slots.map((slot, index) => <div className="group-slot-edit" key={index}>
      <label className="form-field">Jour<select value={slot.dayOfWeek} onChange={(event) => setSlots((current) => current.map((item, row) => row === index ? { ...item, dayOfWeek: Number(event.target.value) } : item))}>
        {[0, 1, 2, 3, 4, 5, 6].map((day) => <option value={day} key={day}>{weekdayName(day)}</option>)}
      </select></label>
      <label className="form-field">Heure<input type="time" value={slot.startTime} onChange={(event) => setSlots((current) => current.map((item, row) => row === index ? { ...item, startTime: event.target.value } : item))}/></label>
      <label className="form-field">Durée<input type="number" min="15" max="240" step="15" value={slot.durationMinutes} onChange={(event) => setSlots((current) => current.map((item, row) => row === index ? { ...item, durationMinutes: Number(event.target.value) } : item))}/></label>
    </div>)}
    <label className="form-field">Date limite de réponse<input required type="datetime-local" value={deadlineAt} onChange={(event) => setDeadlineAt(event.target.value)}/></label>
    <label className="form-field">Nombre de semaines<input type="number" min="1" max="52" value={weeks} onChange={(event) => setWeeks(Number(event.target.value))}/></label>
    <button className="button-soft">Proposer les créneaux</button>
  </form>
}

function PollResults({ poll, refresh }: { poll: SchedulePoll; refresh: () => Promise<void> }) {
  const [results, setResults] = useState<Awaited<ReturnType<typeof api.getSchedulePollResults>>>()
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([])
  useEffect(() => { void api.getSchedulePollResults(poll.id).then((value) => {
    setResults(value)
    if (value?.suggestion) setSelectedSlotIds([value.suggestion.id])
  }).catch(() => toast.error('Impossible de charger les votes.')) }, [poll.id])
  async function fix() {
    const selected = selectedSlotIds.length ? selectedSlotIds : results?.suggestion ? [results.suggestion.id] : []
    if (!selected.length) return toast.error('Aucune disponibilité enregistrée.')
    const fixed = await api.fixGroupSchedule(poll.id, selected)
    if (!fixed.ok) return toast.error(fixed.error)
    if (fixed.data.conflictWarnings.length) toast('Conflits élèves : ' + fixed.data.conflictWarnings.join(', '))
    await refresh()
    toast.success('Les séances hebdomadaires sont planifiées.')
  }
  return <section className="group-subform"><h3>Résultats des disponibilités</h3>
    {results?.results.map((result) => <label className="group-slot-result" key={result.slot.id}>
      <input type="checkbox" checked={selectedSlotIds.includes(result.slot.id)} onChange={(event) =>
        setSelectedSlotIds((current) => event.target.checked
          ? [...current, result.slot.id] : current.filter((id) => id !== result.slot.id))}/>
      <span>{weekdayName(result.slot.dayOfWeek)} · {result.slot.startTime} — {result.availableCount} disponible(s), {result.necessaryCount} si nécessaire
        {result.availableStudents.length > 0 && ` · ${result.availableStudents.join(', ')}`}</span>
    </label>)}
    {results?.suggestion && <p>Suggestion : {weekdayName(results.suggestion.dayOfWeek)} à {results.suggestion.startTime}</p>}
    <button className="button-primary" type="button" onClick={() => void fix()}>Fixer le meilleur créneau</button>
  </section>
}

function GroupAssessments({ group, students, refresh }: {
  group: ClassGroup
  students: GroupStudentSummary[]
  refresh: () => Promise<void>
}) {
  const [grades, setGrades] = useState<Awaited<ReturnType<typeof api.getGroupGrades>>>()
  const [title, setTitle] = useState('')
  const [type, setType] = useState<'devoir' | 'oral' | 'TP' | 'quiz'>('devoir')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [maxPoints, setMaxPoints] = useState(20)
  const [coefficient, setCoefficient] = useState(1)
  const [assessmentId, setAssessmentId] = useState('')
  const [scores, setScores] = useState<Record<string, string>>({})
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const load = useCallback(async () => { setGrades(await api.getGroupGrades(group.id)) }, [group.id])
  useEffect(() => { void load().catch(() => toast.error('Impossible de charger les évaluations.')) }, [load])
  async function createAssessment(event: React.FormEvent) {
    event.preventDefault()
    const result = await api.createGroupAssessment({
      groupId: group.id, title, type, date, maxPoints, coefficient, published: true,
    })
    if (!result.ok) return toast.error(result.error)
    setAssessmentId(result.data.id)
    setTitle('')
    await load()
    toast.success('L’évaluation est publiée.')
  }
  async function saveGrade(studentId: string, existing?: { id: string; score?: number; absent: boolean }) {
    if (!assessmentId) return toast.error('Choisissez une évaluation.')
    const scoreText = scores[studentId] ?? (existing?.score === undefined ? '' : String(existing.score))
    const score = scoreText.trim() ? Number(scoreText) : undefined
    const result = await api.recordStudentGrade(assessmentId, studentId, score, false, reasons[studentId] ?? '')
    if (!result.ok) return toast.error(result.error)
    await load()
    await refresh()
    toast.success('La note a été enregistrée.')
  }
  const selectedAssessment = grades?.assessments.find((assessment) => assessment.id === assessmentId)
  return <section className="group-subform">
    <h3>Évaluations et notes</h3>
    <form className="group-form-grid" onSubmit={(event) => void createAssessment(event)}>
      <label className="form-field">Évaluation<input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Devoir de révision"/></label>
      <label className="form-field">Type<select value={type} onChange={(event) => setType(event.target.value as typeof type)}>
        <option value="devoir">Devoir</option><option value="oral">Oral</option><option value="TP">TP</option><option value="quiz">Quiz</option>
      </select></label>
      <label className="form-field">Date<input type="date" required value={date} onChange={(event) => setDate(event.target.value)}/></label>
      <label className="form-field">Barème<input type="number" min="1" max="1000" value={maxPoints} onChange={(event) => setMaxPoints(Number(event.target.value))}/></label>
      <label className="form-field">Coefficient<input type="number" min="0.1" max="100" step="0.1" value={coefficient} onChange={(event) => setCoefficient(Number(event.target.value))}/></label>
      <button className="button-soft">Créer l’évaluation</button>
    </form>
    {grades?.average !== null && grades?.average !== undefined && <p>Moyenne du groupe : {grades.average}/20</p>}
    {grades?.distribution && <p>Répartition des notes /20 (0–4, 5–9, 10–14, 15–20) : {grades.distribution.join(' · ')}</p>}
    <label className="form-field">Saisir les notes pour<select value={assessmentId} onChange={(event) => setAssessmentId(event.target.value)}>
      <option value="">Choisir une évaluation</option>{grades?.assessments.map((assessment) => <option value={assessment.id} key={assessment.id}>{assessment.title}</option>)}
    </select></label>
    {selectedAssessment && <div className="group-grade-list">{students.map((student) => {
      const current = grades?.grades.find((grade) => grade.assessmentId === selectedAssessment.id && grade.studentId === student.studentId)
      return <form className="group-grade-row" key={student.studentId} onSubmit={(event) => { event.preventDefault(); void saveGrade(student.studentId, current) }}>
        <strong>{student.name}</strong>
        <label className="form-field">Note / {selectedAssessment.maxPoints}<input type="number" min="0" max={selectedAssessment.maxPoints} step="0.1"
          value={scores[student.studentId] ?? (current?.score === undefined ? '' : String(current.score))}
          onChange={(event) => setScores((value) => ({ ...value, [student.studentId]: event.target.value }))}/></label>
        {current && <label className="form-field">Motif de correction<input value={reasons[student.studentId] ?? ''} onChange={(event) => setReasons((value) => ({ ...value, [student.studentId]: event.target.value }))}/></label>}
        <button className="button-soft">Enregistrer</button>
      </form>
    })}</div>}
  </section>
}

function GroupSessionTools({ group, sessions, refresh }: {
  group: ClassGroup
  sessions: LiveSession[]
  refresh: () => Promise<void>
}) {
  const [closingSession, setClosingSession] = useState('')
  const [roster, setRoster] = useState<Array<{ studentId: string; name: string; status: GroupAttendance['status'] }>>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [coveredLessonIds, setCoveredLessonIds] = useState<string[]>([])
  const [summary, setSummary] = useState('')
  const [homeworkTitle, setHomeworkTitle] = useState('')
  const [homeworkInstructions, setHomeworkInstructions] = useState('')
  const [homeworkDueAt, setHomeworkDueAt] = useState('')
  async function open(sessionId: string) {
    const [attendance, lessonRows] = await Promise.all([api.getGroupSessionRoster(sessionId), api.getGroupLessons(group.id)])
    setRoster(attendance)
    setLessons(lessonRows)
    setCoveredLessonIds([])
    setSummary('')
    setClosingSession(sessionId)
  }
  async function closeSession(event: React.FormEvent) {
    event.preventDefault()
    const homework = homeworkTitle.trim() ? {
      title: homeworkTitle, instructions: homeworkInstructions,
      dueAt: homeworkDueAt ? new Date(homeworkDueAt).toISOString() : '',
      maxPoints: 20, allowedTypes: ['text' as const],
    } : undefined
    const result = await api.closeGroupSession(closingSession, { attendance: roster, coveredLessonIds, summary, homework })
    if (!result.ok) return toast.error(result.error)
    setClosingSession('')
    await refresh()
    toast.success('La séance a été clôturée.')
  }
  return <section className="group-subform">
    <h3>Clôturer une séance</h3>
    {sessions.length ? sessions.map((session) => <article className="group-session-row" key={session.id}>
      <span>{formatLiveSessionDate(session)} · {session.status === 'ended' ? 'terminée' : session.status}</span>
      <button className="button-soft" type="button" onClick={() => void open(session.id)}>Clôturer la séance</button>
    </article>) : <p>Aucune séance planifiée.</p>}
    {closingSession && <form className="group-close-form" onSubmit={(event) => void closeSession(event)}>
      <h4>Présences — préremplies depuis la salle en direct</h4>
      {roster.map((student) => <label className="group-attendance-row" key={student.studentId}>
        <span>{student.name}</span><select value={student.status} onChange={(event) =>
          setRoster((current) => current.map((item) => item.studentId === student.studentId
            ? { ...item, status: event.target.value as GroupAttendance['status'] } : item))}>
          <option value="présent">Présent</option><option value="absent">Absent</option><option value="retard">Retard</option><option value="absent justifié">Absent justifié</option>
        </select>
      </label>)}
      <fieldset className="group-checkbox-list"><legend>Contenu traité</legend>{lessons.map((lesson) => <label key={lesson.id}>
        <input type="checkbox" checked={coveredLessonIds.includes(lesson.id)} onChange={(event) =>
          setCoveredLessonIds((current) => event.target.checked ? [...current, lesson.id] : current.filter((id) => id !== lesson.id))}/>{lesson.title}
      </label>)}</fieldset>
      <label className="form-field">Résumé de la séance<textarea value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={4000}/></label>
      <details><summary>Ajouter un devoir</summary>
        <label className="form-field">Titre<input value={homeworkTitle} onChange={(event) => setHomeworkTitle(event.target.value)}/></label>
        <label className="form-field">Consignes<textarea value={homeworkInstructions} onChange={(event) => setHomeworkInstructions(event.target.value)}/></label>
        <label className="form-field">Date limite<input type="datetime-local" value={homeworkDueAt} onChange={(event) => setHomeworkDueAt(event.target.value)}/></label>
        <p>Réponse texte uniquement · 20 points maximum.</p>
      </details>
      <div className="group-actions"><button className="button-primary">Enregistrer le cahier de textes</button>
        <button className="button-soft" type="button" onClick={() => setClosingSession('')}>Annuler</button></div>
    </form>}
  </section>
}

function AnnouncementForm({ groupId, refresh }: { groupId: string; refresh: () => Promise<void> }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pinned, setPinned] = useState(false)
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const result = await api.publishGroupAnnouncement(groupId, { title, body, pinned })
    if (!result.ok) return toast.error(result.error)
    setTitle('')
    setBody('')
    await refresh()
    toast.success('L’annonce a été envoyée aux élèves inscrits.')
  }
  return <form className="group-subform" onSubmit={(event) => void submit(event)}>
    <h3>Annonce au groupe</h3>
    <label className="form-field">Titre<input required value={title} onChange={(event) => setTitle(event.target.value)}/></label>
    <label className="form-field">Message<textarea required value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000}/></label>
    <label><input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)}/> Épingler l’annonce</label>
    <button className="button-soft">Publier l’annonce</button>
  </form>
}

export function TeacherSchedulePage() {
  const [sessions, setSessions] = useState<LiveSession[]>([])
  const [requests, setRequests] = useState<Awaited<ReturnType<typeof api.getTeacherRescheduleRequests>>>([])
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    const [liveSessions, rescheduleRequests] = await Promise.all([
      api.getLiveSessions(), api.getTeacherRescheduleRequests(),
    ])
    setSessions(liveSessions.sort((a, b) => liveSessionStart(a).getTime() - liveSessionStart(b).getTime()))
    setRequests(rescheduleRequests)
    setLoading(false)
  }, [])
  useEffect(() => { void refresh().catch(() => toast.error('Impossible de charger l’emploi du temps.')) }, [refresh])
  return <section className="app-page">
    <header className="page-heading"><div><p className="section-kicker">Séances hebdomadaires</p><h1>Mon emploi du temps</h1></div>
      <div className="group-actions"><button className="button-soft" type="button" onClick={() => downloadCalendar(sessions)}>Exporter en .ics</button><button className="button-soft" type="button" onClick={() => window.print()}>Imprimer</button></div>
    </header>
    <section className="admin-table-card"><h2>Demandes de changement</h2>
      {requests.length ? requests.map(({ request, groupName, sessionTitle, studentName }) => <article className="group-request-row" key={request.id}>
        <div><strong>{studentName} · {groupName}</strong><span>{sessionTitle} · {request.reason}</span>
          {request.proposedDate && request.proposedStartTime && <span>Créneau proposé : {request.proposedDate} à {request.proposedStartTime}</span>}
        </div>
        <button className="button-primary" type="button" onClick={async () => {
          const result = await api.decideGroupRescheduleRequest(request.id, 'accepté')
          if (!result.ok) return toast.error(result.error)
          await refresh()
        }}>Accepter</button>
        <button className="button-soft" type="button" onClick={async () => {
          const result = await api.decideGroupRescheduleRequest(request.id, 'refusé')
          if (!result.ok) return toast.error(result.error)
          await refresh()
        }}>Refuser</button>
      </article>) : <p>Aucune demande en attente.</p>}
    </section>
    {loading ? <p role="status">Chargement des séances…</p>
      : sessions.length ? sessions.filter((session) => session.groupId).map((session) =>
        <TeacherSessionCard key={session.id} session={session} refresh={refresh}/>)
        : <div className="empty-state"><h2>Aucune séance planifiée</h2><p>Proposez des créneaux dans « Mes groupes ».</p><Link href="/teacher/groups">Mes groupes</Link></div>}
  </section>
}

function TeacherSessionCard({ session, refresh }: { session: LiveSession; refresh: () => Promise<void> }) {
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(session.date)
  const [startTime, setStartTime] = useState(session.startTime)
  async function update(cancel: boolean) {
    const result = await api.rescheduleGroupSession(session.id, { date, startTime, cancel }, reason)
    if (!result.ok) return toast.error(result.error)
    setReason('')
    await refresh()
    toast.success(cancel ? 'La séance a été annulée.' : 'La séance a été déplacée.')
  }
  return <article className="group-session-card">
    <p className="section-kicker">{formatLiveSessionDate(session)}</p><h2>{session.title}</h2>
    {session.status === 'scheduled' && <Link className="button-soft" href={`/live/${session.id}`}>Ouvrir la salle</Link>}
    <label className="form-field">Nouvelle date<input type="date" value={date} onChange={(event) => setDate(event.target.value)}/></label>
    <label className="form-field">Nouvelle heure<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)}/></label>
    <label className="form-field">Motif obligatoire<textarea minLength={5} value={reason} onChange={(event) => setReason(event.target.value)}/></label>
    <div className="group-actions"><button className="button-soft" type="button" disabled={reason.trim().length < 5} onClick={() => void update(false)}>Déplacer</button>
      <button className="button-soft" type="button" disabled={reason.trim().length < 5} onClick={() => void update(true)}>Annuler la séance</button></div>
  </article>
}

export function AdminGroupsPage() {
  const [sections, setSections] = useState<BacSection[]>([])
  const [groups, setGroups] = useState<ClassGroup[]>([])
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof api.getGroupAdminOverview>>>()
  const [enrollments, setEnrollments] = useState<Awaited<ReturnType<typeof api.getAdminGroupEnrollments>>>([])
  const [groupPayments, setGroupPayments] = useState<Awaited<ReturnType<typeof api.getAdminGroupPayments>>>([])
  const [teacherProfiles, setTeacherProfiles] = useState<TeacherCard[]>([])
  const [paymentsEnabled, setPaymentsEnabled] = useState(false)
  const [sectionName, setSectionName] = useState('')
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [targetGroups, setTargetGroups] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    const [sectionRows, groupRows, stats, enrollmentRows, teachers, settings, paymentRows] = await Promise.all([
      api.listSections(true), api.listClassGroups(), api.getGroupAdminOverview(),
      api.getAdminGroupEnrollments(), api.listTeachers(), api.getSettings(), api.getAdminGroupPayments(),
    ])
    setSections(sectionRows)
    setGroups(groupRows)
    setOverview(stats)
    setEnrollments(enrollmentRows)
    setTeacherProfiles(teachers)
    setPaymentsEnabled(settings.paymentsEnabled === true)
    setGroupPayments(paymentRows)
    setLoading(false)
  }, [])
  useEffect(() => { void refresh().catch(() => toast.error('Impossible de charger l’administration des classes.')) }, [refresh])
  async function saveSection(event: React.FormEvent) {
    event.preventDefault()
    const result = await api.saveSection({ name: sectionName })
    if (!result.ok) return toast.error(result.error)
    setSectionName('')
    await refresh()
    toast.success('La filière a été créée.')
  }
  return <section className="app-page">
    <header className="page-heading"><div><p className="section-kicker">Administration</p><h1>Filières et classes</h1>
      <p>Gérez les filières, les classes, les inscriptions et les indicateurs pédagogiques.</p></div></header>
    <section className="admin-stats">
      <article className="stat-card"><span>Élèves</span><b>{overview?.studentsPerSection.reduce((sum, item) => sum + item.count, 0) ?? 0}</b></article>
      <article className="stat-card"><span>Taux de présence</span><b>{overview?.attendanceRate === null || overview?.attendanceRate === undefined ? '—' : `${overview.attendanceRate}%`}</b></article>
      <article className="stat-card"><span>Classes</span><b>{groups.length}</b></article>
      <article className="stat-card"><span>Paiements</span><b>{paymentsEnabled ? `${overview?.paymentStatuses.payé ?? 0} payés` : 'Désactivés'}</b></article>
    </section>
    <section className="admin-table-card"><h2>Paiements des classes</h2>
      {!paymentsEnabled ? <p>Paiements désactivés. Aucune demande n’est à traiter.</p>
        : groupPayments.length ? groupPayments.map(({ payment, groupName, studentName }) => <article className="group-request-row" key={payment.id}>
          <div><strong>{studentName}</strong><span>{groupName} · {payment.period} · {payment.status}</span></div>
          {payment.receipt && <a className="button-soft" href={payment.receipt} download={`recu-${payment.period}`}>Voir le reçu</a>}
          {payment.status !== 'payé' && <button className="button-primary" type="button" onClick={async () => {
            const result = await api.reviewGroupPayment(payment.id, 'payé')
            if (!result.ok) return toast.error(result.error)
            await refresh()
          }}>Valider</button>}
          {payment.status === 'en attente' && <button className="button-soft" type="button" onClick={async () => {
            const result = await api.reviewGroupPayment(payment.id, 'en retard')
            if (!result.ok) return toast.error(result.error)
            await refresh()
          }}>Marquer en retard</button>}
        </article>) : <p>Aucun paiement de classe à traiter.</p>}
    </section>
    <section className="admin-table-card"><h2>Filières</h2>
      <form className="group-actions" onSubmit={(event) => void saveSection(event)}>
        <label className="form-field">Nouvelle filière<input required minLength={2} value={sectionName} onChange={(event) => setSectionName(event.target.value)}/></label>
        <button className="button-primary">Ajouter</button>
      </form>
      {sections.map((section) => <form className="group-section-row" key={section.id} onSubmit={async (event) => {
        event.preventDefault()
        const result = await api.saveSection({ id: section.id, name: editing[section.id] ?? section.name, active: section.active })
        if (!result.ok) return toast.error(result.error)
        await refresh()
      }}>
        <input aria-label={`Nom de la filière ${section.name}`} value={editing[section.id] ?? section.name}
          onChange={(event) => setEditing((current) => ({ ...current, [section.id]: event.target.value }))}/>
        <span>{section.active ? 'Active' : 'Désactivée'}</span><button className="button-soft">Enregistrer</button>
        <button className="button-soft" type="button" onClick={async () => {
          const result = await api.saveSection({ id: section.id, name: section.name, active: !section.active })
          if (!result.ok) return toast.error(result.error)
          await refresh()
        }}>{section.active ? 'Désactiver' : 'Réactiver'}</button>
      </form>)}
    </section>
    {overview?.studentsPerSection.map(({ section, count }) => <p key={section.id}>{section.name} : {count} élève(s)</p>)}
    <section className="admin-table-card"><h2>Toutes les classes</h2>
      {loading ? <p role="status">Chargement…</p> : groups.map((group) => {
        const stats = overview?.groups.find((item) => item.group.id === group.id)
        const teacher = teacherProfiles.find((item) => item.id === group.teacherId)
        return <article className="group-request-row" key={group.id}>
          <div><strong>{group.name}</strong><span>{teacher?.name ?? 'Professeur'} · {stats?.accepted ?? 0}/{group.maxStudents} · {group.status}</span></div>
          <span>{stats?.capacityPercent ?? 0}% remplie</span>
          {group.status !== 'fermé' && <button className="button-soft" type="button" onClick={async () => {
            const result = await api.forceCloseClassGroup(group.id)
            if (!result.ok) return toast.error(result.error)
            await refresh()
          }}>Forcer la fermeture</button>}
        </article>
      })}
    </section>
    <section className="admin-table-card"><h2>Inscriptions et déplacements</h2>
      {enrollments.map(({ enrollment, groupName, studentName, section }) => {
        const currentGroup = groups.find((group) => group.id === enrollment.groupId)
        const targets = groups.filter((group) => group.subjectId === currentGroup?.subjectId
          && group.id !== currentGroup?.id && group.status !== 'fermé')
        return <article className="group-request-row" key={enrollment.id}>
          <div><strong>{studentName}</strong><span>{section} · {groupName} · {enrollment.status}</span></div>
          {enrollment.status === 'accepté' && targets.length > 0 && <>
            <select aria-label={`Classe cible pour ${studentName}`} value={targetGroups[enrollment.id] ?? ''} onChange={(event) =>
              setTargetGroups((current) => ({ ...current, [enrollment.id]: event.target.value }))}>
              <option value="">Déplacer vers…</option>{targets.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
            <button className="button-soft" type="button" disabled={!targetGroups[enrollment.id]} onClick={async () => {
              const result = await api.adminMoveStudentToGroup(enrollment.studentId, enrollment.groupId, targetGroups[enrollment.id])
              if (!result.ok) return toast.error(result.error)
              await refresh()
              toast.success('L’élève a été déplacé.')
            }}>Déplacer</button>
          </>}
        </article>
      })}
      {!enrollments.length && <p>Aucune inscription enregistrée.</p>}
    </section>
  </section>
}



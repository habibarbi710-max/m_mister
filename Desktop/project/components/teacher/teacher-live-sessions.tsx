'use client'

import { useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CalendarDays, CircleCheck, CirclePlay, Clock3, ExternalLink, Plus, Radio, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import * as api from '@/lib/api'
import { useAuth } from '@/components/shared/auth-provider'
import { useLanguage } from '@/components/shared/language-provider'
import { translateApiError } from '@/components/shared/api-error'
import { MAX_STUDENTS_PER_SESSION } from '@/lib/livekit-config'
import { terminateLiveKitRoom } from '@/lib/livekit-client'
import { formatLiveSessionDate, liveSessionStart } from '@/lib/live-time'
import type { LiveQuestion, LiveSession, LiveSessionInput, Subject } from '@/types'

const emptySession = (): LiveSessionInput => ({
  title: '',
  description: '',
  subjectId: '',
  date: todayInTunis(),
  startTime: '18:00',
  durationMinutes: 60,
  provider: 'livekit',
  externalUrl: undefined,
  replayUrl: undefined,
  resources: [],
})

function todayInTunis(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function TeacherLiveSessions({ sessions, refresh }: { sessions: LiveSession[]; refresh: () => Promise<void> }) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [editingId, setEditingId] = useState('')
  const schema = useMemo(() => z.object({
    title: z.string().trim().min(2, 'Saisissez un titre (2 caractères minimum).').max(160, 'Le titre est trop long.'),
    description: z.string().max(2000, 'La description est trop longue.'),
    subjectId: z.string().min(1, 'Choisissez une matière.'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choisissez une date valide.').refine((value) => value >= todayInTunis(), 'La date ne peut pas être passée.'),
    startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Choisissez une heure valide.'),
    durationMinutes: z.number().int().min(15, 'La durée minimale est de 15 minutes.').max(240, 'La durée maximale est de 240 minutes.'),
    provider: z.enum(['livekit', 'external']),
    externalUrl: z.union([z.string().url('Saisissez une URL valide.'), z.literal('')]).optional(),
    replayUrl: z.union([z.string().url('Saisissez une URL valide.'), z.literal('')]).optional(),
    resources: z.array(z.object({ title: z.string().trim().min(1, 'Saisissez un titre.'), url: z.string().url('Saisissez une URL valide.') })).max(30),
  }).superRefine((values, context) => {
    if (values.provider === 'external' && !values.externalUrl) {
      context.addIssue({ code: 'custom', path: ['externalUrl'], message: 'Le lien Meet ou Zoom est obligatoire.' })
    }
    for (const [field, url] of [['externalUrl', values.externalUrl], ['replayUrl', values.replayUrl]] as const) {
    if (url) {
      try {
        if (!['http:', 'https:'].includes(new URL(url).protocol)) throw new Error('protocol')
      } catch {
        context.addIssue({ code: 'custom', path: [field], message: 'Saisissez une URL HTTP ou HTTPS valide.' })
      }
    }
    }
  }), [])
  const { register, control, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<LiveSessionInput>({
    resolver: zodResolver(schema),
    defaultValues: emptySession(),
  })
  const resourceFields = useFieldArray({ control, name: 'resources' })
  const provider = useWatch({ control, name: 'provider' })
  const durationMinutes = useWatch({ control, name: 'durationMinutes' })
  useEffect(() => {
    void api.getSubjects().then(setSubjects).catch(() => toast.error(t('unknownError')))
  }, [t])

  function edit(session: LiveSession) {
    setEditingId(session.id)
    reset({
      title: session.title,
      description: session.description,
      subjectId: session.subjectId,
      date: session.date,
      startTime: session.startTime,
      durationMinutes: session.durationMinutes,
      provider: session.provider,
      externalUrl: session.externalUrl ?? '',
      replayUrl: session.replayUrl ?? '',
      resources: session.resources,
    })
  }

  function clearForm() {
    setEditingId('')
    reset(emptySession())
  }

  async function submit(values: LiveSessionInput) {
    const clean = {
      ...values,
      externalUrl: values.provider === 'external' ? values.externalUrl : undefined,
      replayUrl: values.replayUrl || undefined,
    }
    const result = editingId
      ? await api.updateLiveSession(editingId, clean)
      : repeating
        ? await api.createWeeklyLiveSessions(clean, 8)
        : await api.createLiveSession(clean)
    if (!result.ok) return toast.error(translateApiError(result.error, t))
    clearForm()
    await refresh()
    toast.success(editingId || !repeating ? t('sessionSaved') : 'Les 8 séances hebdomadaires ont été créées.')
  }

  const [repeating, setRepeating] = useState(false)

  async function changeStatus(session: LiveSession, status: LiveSession['status']) {
    if ((status === 'ended' || (status === 'cancelled' && session.status === 'live'))
      && session.provider === 'livekit' && user?.role === 'teacher') {
      const ended = await terminateLiveKitRoom(session, user)
      if (!ended.ok) {
        toast.error(ended.error)
        return
      }
    }
    const result = status === 'cancelled'
      ? await api.cancelLiveSession(session.id)
      : await api.setLiveSessionStatus(session.id, status)
    if (!result.ok) {
      toast.error(translateApiError(result.error, t))
      return
    }
    await refresh()
    toast.success(status === 'cancelled' ? t('sessionCancelled') : status === 'live' ? 'Le direct a commencé.' : 'Le direct est terminé.')
  }

  const sortedSessions = [...sessions].sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime))
  return <section id="sessions" className="live-management">
    <header className="live-management-heading"><div><p className="section-kicker">Gestion des séances</p><h2>{t('sessions')}</h2><p>Créez une salle LiveKit ou ajoutez un lien Meet / Zoom.</p></div></header>
    <form className="live-session-form" onSubmit={handleSubmit(submit)} noValidate>
      <div className="live-form-heading"><h3>{editingId ? 'Modifier la séance' : 'Programmer une séance'}</h3>{editingId && <button className="icon-button" type="button" aria-label="Fermer la modification" onClick={clearForm}><X aria-hidden="true"/></button>}</div>
      <Field label={t('title')} error={errors.title?.message}><input {...register('title')} /></Field>
      <Field label="Description" error={errors.description?.message}><textarea {...register('description')} rows={3}/></Field>
      <Field label={t('subject')} error={errors.subjectId?.message}><select {...register('subjectId')}><option value="">Choisir une matière</option>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.titleFr}</option>)}</select></Field>
      <div className="live-form-grid">
        <Field label={t('date')} error={errors.date?.message}><input type="date" min={todayInTunis()} {...register('date')} /></Field>
        <Field label={t('time')} error={errors.startTime?.message}><input type="time" {...register('startTime')} /></Field>
        <Field label="Durée (minutes)" error={errors.durationMinutes?.message}><input type="number" min={15} max={240} step={15} {...register('durationMinutes', { valueAsNumber: true })} /></Field>
      </div>
      <Field label="Type de salle" error={errors.provider?.message}><select {...register('provider')}><option value="livekit">Salle LiveKit intégrée</option><option value="external">Lien externe Meet / Zoom</option></select></Field>
      {provider === 'external' && <Field label="Lien externe" error={errors.externalUrl?.message}><input type="url" placeholder="https://" {...register('externalUrl')} /></Field>}
      {editingId && <Field label="Lien du replay" error={errors.replayUrl?.message}><input type="url" placeholder="https://" {...register('replayUrl')} /></Field>}
      <section className="live-resource-editor"><div className="live-inline-heading"><h4>Ressources</h4><button type="button" className="button-soft" onClick={() => resourceFields.append({ title: '', url: '' })}><Plus aria-hidden="true"/> Ajouter un lien</button></div>
        {resourceFields.fields.map((field, index) => <div className="live-resource-fields" key={field.id}><Field label="Titre"><input {...register(`resources.${index}.title`)} /></Field><Field label="Lien ou PDF"><input type="url" placeholder="https://" {...register(`resources.${index}.url`)} /></Field><button className="icon-button" type="button" aria-label="Retirer la ressource" onClick={() => resourceFields.remove(index)}><X aria-hidden="true"/></button></div>)}
      </section>
      {!editingId && <label className="live-repeat-option"><input type="checkbox" checked={repeating} onChange={(event) => setRepeating(event.target.checked)}/><span>Répéter chaque semaine pendant 8 séances</span></label>}
      <p className="live-usage-hint"><Clock3 aria-hidden="true"/> Coût estimé au maximum : {durationMinutes} min × {MAX_STUDENTS_PER_SESSION} élèves = {durationMinutes * MAX_STUDENTS_PER_SESSION} minutes-participant.</p>
      <button className="button-primary" disabled={isSubmitting}>{isSubmitting ? t('loading') : editingId ? t('save') : 'Créer la séance'}</button>
    </form>
    <section className="live-managed-sessions"><h3>Séances programmées</h3>{sortedSessions.length === 0 && <p className="empty-state compact-empty">Aucune séance pour le moment.</p>}
      {sortedSessions.map((session) => <ManagedSession key={session.id} session={session} edit={edit} changeStatus={changeStatus} canManage={user?.role === 'admin' || session.teacherId === user?.id}/>)}
    </section>
  </section>
}

function ManagedSession({ session, edit, changeStatus, canManage }: {
  session: LiveSession
  edit: (session: LiveSession) => void
  changeStatus: (session: LiveSession, status: LiveSession['status']) => Promise<void>
  canManage: boolean
}) {
  const { t } = useLanguage()
  const [attendance, setAttendance] = useState(0)
  const [questions, setQuestions] = useState<LiveQuestion[]>([])
  const [expanded, setExpanded] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const startsAt = liveSessionStart(session).getTime()
  const canStart = now >= startsAt - 15 * 60_000
    && now <= startsAt + session.durationMinutes * 60_000
  useEffect(() => {
    let active = true
    async function refreshDetails() {
      const [count, rows] = await Promise.all([api.getLiveAttendanceCount(session.id), api.getLiveQuestions(session.id)])
      if (active) {
        setAttendance(count)
        setQuestions(rows)
      }
    }
    void refreshDetails().catch(() => toast.error(t('unknownError')))
    const timer = window.setInterval(() => {
      setNow(Date.now())
      void refreshDetails().catch(() => toast.error(t('unknownError')))
    }, 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [session.id, t])

  async function answer(questionId: string) {
    const result = await api.markLiveQuestionAnswered(questionId)
    if (!result.ok) return toast.error(translateApiError(result.error, t))
    setQuestions((current) => current.map((question) => question.id === questionId ? result.data : question))
  }

  return <article className="managed-live-card">
    <div className="managed-live-main"><div className="managed-live-meta"><span className={`live-status-badge live-status-${session.status}`}>{session.status === 'live' ? 'EN DIRECT' : statusLabel(session.status)}</span><span className="session-date"><CalendarDays aria-hidden="true"/>{formatLiveSessionDate(session)}</span></div>
      <h4>{session.title}</h4><p>{session.description || 'Aucune description.'}</p><p><Clock3 aria-hidden="true"/> {session.durationMinutes} min · {session.provider === 'livekit' ? 'Salle LiveKit' : 'Lien externe'} · <Users aria-hidden="true"/> {attendance} participant{attendance === 1 ? '' : 's'}</p>
      {session.replayUrl && <a className="managed-replay-link" href={session.replayUrl} target="_blank" rel="noreferrer"><CirclePlay aria-hidden="true"/> Voir le replay <ExternalLink aria-hidden="true"/></a>}
      {session.resources.length > 0 && <ul className="managed-resource-list">{session.resources.map((resource) => <li key={`${resource.title}-${resource.url}`}><a href={resource.url} target="_blank" rel="noreferrer">{resource.title} <ExternalLink aria-hidden="true"/></a></li>)}</ul>}
      <div className="managed-live-actions">
        {canManage && session.status === 'scheduled' && canStart && <button className="button-primary" type="button" onClick={() => void changeStatus(session, 'live')}><Radio aria-hidden="true"/> Démarrer le live</button>}
        {canManage && session.status === 'scheduled' && !canStart && <span className="live-usage-hint">La salle ouvre 15 minutes avant le début.</span>}
        {canManage && session.status === 'live' && <button className="button-primary" type="button" onClick={() => void changeStatus(session, 'ended')}><CircleCheck aria-hidden="true"/> Terminer le live</button>}
        {canManage && session.status !== 'cancelled' && <button className="button-soft" type="button" onClick={() => edit(session)}>{t('editLesson')}</button>}
        {canManage && session.status !== 'cancelled' && session.status !== 'ended' && <button className="button-danger" type="button" onClick={() => void changeStatus(session, 'cancelled')}>{t('cancelSession')}</button>}
      </div>
    </div>
    <div className="managed-questions"><button className="questions-toggle" type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>Questions ({questions.length})</button>
      {expanded && <div className="live-question-list">{questions.length === 0 && <p>Aucune question pour le moment.</p>}{questions.map((question) => <article className={`live-question-card${question.answered ? ' is-answered' : ''}`} key={question.id}><p>{question.text}</p><span>{question.voterIds.length} vote{question.voterIds.length === 1 ? '' : 's'}{question.answered ? ' · Répondue' : ''}</span>{canManage && !question.answered && <button className="button-soft" type="button" onClick={() => void answer(question.id)}>Marquer comme répondue</button>}</article>)}</div>}
    </div>
  </article>
}

function statusLabel(status: LiveSession['status']): string {
  return status === 'scheduled' ? 'À venir' : status === 'ended' ? 'Terminée' : 'Annulée'
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className="form-field">{label}{children}{error && <small role="alert">{error}</small>}</label>
}

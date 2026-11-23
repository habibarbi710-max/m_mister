'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import * as api from '@/lib/api'
import { useAuth } from '@/components/shared/auth-provider'
import type {
  HomeworkFile,
  HomeworkSubmission,
  LessonQuestion,
  PrivateMessage,
  RelationshipSettings,
  Section,
  Subject,
  TeacherAnnouncement,
} from '@/types'

type TeacherProfile = NonNullable<Awaited<ReturnType<typeof api.getTeacherProfile>>>

export function TeacherDirectory() {
  const [teachers, setTeachers] = useState<Awaited<ReturnType<typeof api.listTeachers>>>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [query, setQuery] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    void Promise.all([api.listTeachers(query, subjectId), api.getSubjects()])
      .then(([rows, catalog]) => {
        if (active) {
          setTeachers(rows)
          setSubjects(catalog)
        }
      })
      .catch(() => toast.error('Impossible de charger les professeurs.'))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [query, subjectId])
  return <section className="app-page">
    <header className="page-heading"><div><p className="section-kicker">Communauté éducative</p><h1>Nos professeurs</h1><p>Recherchez un enseignant par nom, spécialité ou matière.</p></div></header>
    <div className="catalog-toolbar">
      <label>Rechercher un professeur<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom ou spécialité"/></label>
      <label>Matière<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}><option value="">Toutes les matières</option>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.titleFr}</option>)}</select></label>
    </div>
    {loading ? <p role="status">Chargement des professeurs…</p>
      : teachers.length === 0 ? <div className="empty-state"><h2>Aucun professeur trouvé</h2><p>Essayez un autre nom ou une autre matière.</p></div>
        : <div className="teacher-cards">{teachers.map((teacher) => <article className="teacher-card" key={teacher.id}>
          <TeacherAvatar name={teacher.name} photoUrl={teacher.photoUrl}/>
          <h2>{teacher.name}</h2><p>{teacher.bio || 'Professeur sur EduBac'}</p>
          <p>{teacher.specialties.join(' · ') || 'Spécialités à venir'}</p>
          <p>{teacher.lessonCount} leçons · {teacher.followerCount} abonnés · {teacher.averageRating ?? '—'} ★</p>
          <Link className="button-soft" href={`/teachers/${teacher.id}`}>Voir le profil</Link>
        </article>)}</div>}
  </section>
}

function StudentAvatar({ name, photoUrl }: { name: string; photoUrl: string }) {
  return photoUrl
    ? <Image className="relationship-avatar relationship-avatar--student" src={photoUrl} width={44} height={44} alt={`Avatar de ${name}`} unoptimized/>
    : <span className="relationship-avatar relationship-avatar--student relationship-avatar--initial" aria-label={`Avatar de ${name}`}>{name.slice(0, 1).toLocaleUpperCase('fr')}</span>
}

export function TeacherPublicProfile({ teacherId }: { teacherId: string }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState<TeacherProfile>()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [following, setFollowing] = useState(false)
  const [message, setMessage] = useState('')
  const [lessonId, setLessonId] = useState('')
  const [stars, setStars] = useState(5)
  const [comment, setComment] = useState('')
  const [completedIds, setCompletedIds] = useState<string[]>([])
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    const [teacher, catalog, followed, completed] = await Promise.all([
      api.getTeacherProfile(teacherId), api.getSubjects(), api.getMyTeachers(), api.getCompletedLessons(),
    ])
    setProfile(teacher)
    setSubjects(catalog)
    setFollowing(followed.some((item) => item.id === teacherId))
    setCompletedIds(completed)
  }, [teacherId])
  useEffect(() => {
    let active = true
    void refresh().catch(() => {
      if (active) setError('Impossible de charger ce profil.')
    })
    return () => { active = false }
  }, [refresh])
  if (error) return <section className="app-page"><div className="empty-state"><h1>{error}</h1><Link href="/teachers">Retour aux professeurs</Link></div></section>
  if (!profile) return <section className="app-page"><div className="loading-surface" role="status"><span className="skeleton-line"/><span className="skeleton-line"/></div></section>
  const subjectNames = profile.subjectIds.map((id) => subjects.find((subject) => subject.id === id)?.titleFr ?? id)
  const lessons = subjects.flatMap((subject) => subject.chapters.flatMap((chapter) => chapter.lessons))
    .filter((lesson) => lesson.teacherId === teacherId && lesson.status === 'published')
  async function toggleFollow() {
    const result = following ? await api.unfollowTeacher(teacherId) : await api.followTeacher(teacherId)
    if (!result.ok) return toast.error(result.error)
    setFollowing(!following)
  }
  async function sendMessage(event: React.FormEvent) {
    event.preventDefault()
    const result = await api.sendTeacherMessage(teacherId, message)
    if (!result.ok) return toast.error(result.error)
    setMessage('')
    toast.success('Message envoyé dans EduBac.')
  }
  async function submitRating(event: React.FormEvent) {
    event.preventDefault()
    if (!lessonId) return toast.error('Choisissez une leçon terminée.')
    const result = await api.rateLesson(lessonId, stars, comment)
    if (!result.ok) return toast.error(result.error)
    setComment('')
    toast.success('Votre avis a été enregistré.')
    void refresh()
  }
  return <section className="app-page">
    <header className="page-heading relationship-profile-heading">
      <TeacherAvatar name={profile.name} photoUrl={profile.photoUrl}/>
      <div><p className="section-kicker">Profil professeur</p><h1>{profile.name}</h1><p>{subjectNames.join(' · ') || 'Matières à venir'}</p></div>
      <div className="relationship-actions">
        {user?.role === 'student' && <button className="button-primary" type="button" onClick={() => void toggleFollow()}>{following ? 'Ne plus suivre' : 'Suivre'}</button>}
        {user?.role === 'student' && <Link className="button-soft" href="/messages">Mes messages</Link>}
      </div>
    </header>
    <div className="dashboard-stats">
      <RelationshipStat label="Leçons" value={String(profile.lessonCount)}/>
      <RelationshipStat label="Abonnés" value={String(profile.followerCount)}/>
      <RelationshipStat label="Note moyenne" value={profile.averageRating === null ? '—' : `${profile.averageRating} / 5`}/>
    </div>
    <section className="admin-table-card"><h2>À propos</h2><p>{profile.bio || 'Ce professeur complètera bientôt sa présentation.'}</p><p><strong>Spécialités :</strong> {profile.specialties.join(', ') || 'Non renseignées'}</p></section>
    {user?.role === 'teacher' && user.id === teacherId && <TeacherProfileEditor profile={profile} saved={refresh}/>}
    {user?.role === 'student' && <form className="admin-table-card relationship-form" onSubmit={(event) => void sendMessage(event)}>
      <h2>Écrire au professeur</h2><p>Les échanges restent dans EduBac. Les coordonnées sont automatiquement masquées.</p>
      <label className="form-field">Votre message<textarea value={message} onChange={(event) => setMessage(event.target.value)} required maxLength={3000}/></label>
      <button className="button-primary" type="submit">Envoyer un message</button>
    </form>}
    {user?.role === 'student' && completedIds.some((id) => lessons.some((lesson) => lesson.id === id)) && <form className="admin-table-card relationship-form" onSubmit={(event) => void submitRating(event)}>
      <h2>Noter une leçon terminée</h2>
      <label className="form-field">Leçon<select value={lessonId} onChange={(event) => setLessonId(event.target.value)} required><option value="">Choisir une leçon</option>{lessons.filter((lesson) => completedIds.includes(lesson.id)).map((lesson) => <option value={lesson.id} key={lesson.id}>{lesson.title}</option>)}</select></label>
      <label className="form-field">Note<select value={stars} onChange={(event) => setStars(Number(event.target.value))}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} étoiles</option>)}</select></label>
      <label className="form-field">Commentaire facultatif<textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000}/></label>
      <button className="button-primary" type="submit">Enregistrer mon avis</button>
    </form>}
    <section className="admin-table-card"><h2>Prochaines séances en direct</h2>{profile.upcomingSessions.length === 0 ? <p>Aucune séance programmée pour le moment.</p> : profile.upcomingSessions.map((session) => <p key={session.id}>{session.title} · {session.date} à {session.startTime}</p>)}</section>
  </section>
}

function TeacherProfileEditor({ profile, saved }: { profile: TeacherProfile; saved: () => Promise<void> }) {
  const [bio, setBio] = useState(profile.bio)
  const [photoUrl, setPhotoUrl] = useState(profile.photoUrl)
  const [specialties, setSpecialties] = useState(profile.specialties.join(', '))
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const result = await api.saveTeacherProfile({
      bio, photoUrl, specialties: specialties.split(',').map((item) => item.trim()).filter(Boolean),
      subjectIds: profile.subjectIds,
    })
    if (!result.ok) return toast.error(result.error)
    await saved()
    toast.success('Profil enregistré.')
  }
  return <form className="admin-table-card relationship-form" onSubmit={(event) => void submit(event)}>
    <h2>Modifier mon profil</h2>
    <label className="form-field">Photo (URL HTTPS)<input type="url" value={photoUrl} onChange={(event) => setPhotoUrl(event.target.value)}/></label>
    <label className="form-field">Présentation<textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={3000}/></label>
    <label className="form-field">Spécialités, séparées par une virgule<input value={specialties} onChange={(event) => setSpecialties(event.target.value)}/></label>
    <button className="button-primary" type="submit">Enregistrer le profil</button>
  </form>
}

function TeacherAvatar({ name, photoUrl }: { name: string; photoUrl: string }) {
  return photoUrl
    ? <Image className="relationship-avatar" src={photoUrl} width={88} height={88} alt={`Photo de ${name}`} unoptimized/>
    : <span className="relationship-avatar relationship-avatar--initial" aria-label={`Avatar de ${name}`}>{name.slice(0, 1).toLocaleUpperCase('fr')}</span>
}

function RelationshipStat({ label, value }: { label: string; value: string }) {
  return <article className="stat-card"><span className="stat-label">{label}</span><b>{value}</b></article>
}

export function LessonQuestions({ lessonId }: { lessonId: string }) {
  const { user } = useAuth()
  const [questions, setQuestions] = useState<LessonQuestion[]>([])
  const [sort, setSort] = useState<'recent' | 'popular' | 'unanswered'>('recent')
  const [questionText, setQuestionText] = useState('')
  const [position, setPosition] = useState('')
  const [replies, setReplies] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  async function refresh() { setQuestions(await api.getLessonQuestions(lessonId, sort)) }
  useEffect(() => {
    let active = true
    void api.getLessonQuestions(lessonId, sort).then((rows) => { if (active) setQuestions(rows) })
      .catch(() => toast.error('Impossible de charger les questions.'))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [lessonId, sort])
  async function ask(event: React.FormEvent) {
    event.preventDefault()
    const seconds = position.trim() ? Number(position) : undefined
    const result = await api.askLessonQuestion(lessonId, questionText, seconds)
    if (!result.ok) return toast.error(result.error)
    setQuestionText('')
    setPosition('')
    await refresh()
  }
  async function reply(event: React.FormEvent, questionId: string) {
    event.preventDefault()
    const result = await api.answerLessonQuestion(questionId, replies[questionId] ?? '')
    if (!result.ok) return toast.error(result.error)
    setReplies((current) => ({ ...current, [questionId]: '' }))
    await refresh()
  }
  async function report(type: 'question' | 'answer', id: string) {
    const result = await api.createReport(type, id, 'Contenu à vérifier')
    if (!result.ok) return toast.error(result.error)
    toast.success('Signalement transmis à la modération.')
  }
  return <section className="admin-table-card relationship-questions" aria-labelledby={`questions-${lessonId}`}>
    <div className="relationship-section-heading"><h2 id={`questions-${lessonId}`}>Questions</h2><label className="form-field">Trier<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="recent">Récentes</option><option value="popular">Populaires</option><option value="unanswered">Sans réponse</option></select></label></div>
    {user?.role === 'student' && <form className="relationship-form" onSubmit={(event) => void ask(event)}>
      <label className="form-field">Votre question<textarea value={questionText} onChange={(event) => setQuestionText(event.target.value)} required maxLength={3000}/></label>
      <label className="form-field">Position dans la vidéo (secondes, facultatif)<input type="number" min="0" value={position} onChange={(event) => setPosition(event.target.value)}/></label>
      <button className="button-primary" type="submit">Poser une question</button>
    </form>}
    {loading ? <p role="status">Chargement des questions…</p>
      : questions.length === 0 ? <p>Aucune question pour le moment.</p>
        : questions.map((question) => <article className="relationship-post" key={question.id}>
          <p>{question.text}</p>
          {question.videoPositionSeconds !== undefined && <a href={`#video-${Math.floor(question.videoPositionSeconds)}`}>À {Math.floor(question.videoPositionSeconds / 60)}:{String(question.videoPositionSeconds % 60).padStart(2, '0')}</a>}
          <div className="relationship-actions">
            <button type="button" className="button-soft" onClick={async () => { const result = await api.upvoteLessonQuestion(question.id); if (!result.ok) toast.error(result.error); else await refresh() }}>Utile · {question.voterIds.length}</button>
            <button type="button" className="button-soft" onClick={() => void report('question', question.id)}>Signaler</button>
            {user?.role === 'teacher' && <button type="button" className="button-soft" onClick={async () => { const result = await api.markLessonQuestionAnswered(question.id); if (!result.ok) toast.error(result.error); else await refresh() }}>Marquer « Répondue »</button>}
          </div>
          {question.answers.filter((answer) => !answer.hidden).map((answer) => <div className={`relationship-answer${answer.teacherAnswer ? ' relationship-answer--teacher' : ''}`} key={answer.id}>
            {answer.teacherAnswer && <strong>Réponse du professeur</strong>}<p>{answer.text}</p>
            <div className="relationship-actions"><button type="button" className="button-soft" onClick={() => void report('answer', answer.id)}>Signaler</button>
              {user?.role === 'teacher' && <button type="button" className="button-soft" onClick={async () => { const result = await api.pinLessonQuestionAnswer(question.id, answer.id); if (!result.ok) toast.error(result.error); else await refresh() }}>{question.pinnedAnswerId === answer.id ? 'Réponse épinglée' : 'Épingler la meilleure réponse'}</button>}
            </div>
          </div>)}
          {user && user.role !== 'admin' && <form className="relationship-reply" onSubmit={(event) => void reply(event, question.id)}>
            <label className="form-field">Répondre<textarea value={replies[question.id] ?? ''} onChange={(event) => setReplies((current) => ({ ...current, [question.id]: event.target.value }))} required maxLength={3000}/></label>
            <button className="button-soft" type="submit">Répondre</button>
          </form>}
        </article>)}
  </section>
}

export function TeacherStudentsPage() {
  const [students, setStudents] = useState<Awaited<ReturnType<typeof api.getTeacherStudents>>>([])
  const [selected, setSelected] = useState<Awaited<ReturnType<typeof api.getTeacherStudentDetail>>>()
  const [alerts, setAlerts] = useState<Awaited<ReturnType<typeof api.getTeacherAlerts>>>()
  const [query, setQuery] = useState('')
  const [section, setSection] = useState<Section | 'all'>('all')
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    try {
      const [rows, warning] = await Promise.all([api.getTeacherStudents(query, section), api.getTeacherAlerts()])
      setStudents(rows)
      setAlerts(warning)
      setError('')
    } catch {
      setError('Impossible de charger le suivi des élèves.')
    }
  }, [query, section])
  useEffect(() => { void refresh() }, [refresh])
  async function open(studentId: string) { setSelected(await api.getTeacherStudentDetail(studentId)) }
  return <section className="app-page">
    <header className="page-heading"><div><p className="section-kicker">Suivi pédagogique</p><h1>Mes élèves</h1><p>Seuls les élèves qui vous suivent ou qui sont inscrits à vos matières apparaissent ici.</p></div></header>
    {error && <p role="alert">{error}</p>}
    {alerts && <section className="admin-table-card"><h2>Élèves en difficulté</h2>{alerts.strugglingStudents.length
      ? alerts.strugglingStudents.map((student) => <p key={student.id}>{student.name} · {student.averageQuizScore ?? '—'} % aux quiz · {student.lastActivityAt ? `activité ${new Date(student.lastActivityAt).toLocaleDateString('fr-FR')}` : 'aucune activité connue'}</p>)
      : <p>Aucune alerte pour le moment.</p>}
      <h2>Questions les plus ratées</h2>{alerts.difficultQuestions.length
        ? alerts.difficultQuestions.map((item, index) => <p key={`${item.lessonId}-${index}`}>{item.lessonTitle} · {item.successRate} % de réussite · {item.question}</p>)
        : <p>Les résultats des quiz apparaîtront ici.</p>}
    </section>}
    <section className="admin-table-card">
      <div className="relationship-section-heading"><h2>Liste des élèves</h2>
        <label className="form-field">Rechercher<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Prénom et initiale"/></label>
        <label className="form-field">Section<select value={section} onChange={(event) => setSection(event.target.value as Section | 'all')}><option value="all">Toutes</option>{sectionValues.map((value) => <option key={value}>{value}</option>)}</select></label>
      </div>
      {students.length === 0 ? <p>Aucun élève correspondant.</p> : <div className="relationship-student-list">{students.map((student) => <button className="relationship-student-row" type="button" key={student.id} onClick={() => void open(student.id)}>
        <StudentAvatar name={student.name} photoUrl={student.avatarUrl}/><strong>{student.name}</strong><span>{student.section}</span><span>{student.progressPercent} % de progression</span><span>Quiz : {student.averageQuizScore ?? '—'} %</span><span>Activité : {student.lastActivityAt ? new Date(student.lastActivityAt).toLocaleDateString('fr-FR') : '—'}</span>
      </button>)}</div>}
    </section>
    {selected && <section className="admin-table-card"><div className="relationship-section-heading"><h2>Dossier de {selected.student.name}</h2><button className="button-soft" type="button" onClick={() => setSelected(undefined)}>Fermer</button></div>
      <h3>Leçons terminées</h3>{selected.completedLessons.map((lesson) => <p key={lesson.id}>{lesson.title}</p>)}
      <h3>Historique des quiz</h3>{selected.quizHistory.length ? selected.quizHistory.map((result) => <p key={result.id}>{result.title} · {result.score} % · {new Date(result.date).toLocaleDateString('fr-FR')}</p>) : <p>Aucun quiz complété.</p>}
      <h3>Notes des devoirs</h3>{selected.homeworkGrades.length ? selected.homeworkGrades.map((grade, index) => <p key={`${grade.title}-${index}`}>{grade.title} · {grade.grade}/{grade.maxPoints} · {grade.feedback}</p>) : <p>Aucune note de devoir.</p>}
    </section>}
  </section>
}

export function TeacherQuestionsInbox() {
  const [lessons, setLessons] = useState<Awaited<ReturnType<typeof api.getTeacherLessons>>>([])
  const [lessonId, setLessonId] = useState('')
  const [items, setItems] = useState<Awaited<ReturnType<typeof api.getTeacherQuestionInbox>>>([])
  const [replies, setReplies] = useState<Record<string, string>>({})
  const refresh = useCallback(async () => { setItems(await api.getTeacherQuestionInbox(lessonId || undefined)) }, [lessonId])
  useEffect(() => {
    void Promise.all([api.getTeacherLessons(), api.getTeacherQuestionInbox()])
      .then(([ownLessons, questions]) => { setLessons(ownLessons); setItems(questions) })
      .catch(() => toast.error('Impossible de charger les questions.'))
  }, [])
  useEffect(() => { void refresh().catch(() => toast.error('Impossible de filtrer les questions.')) }, [refresh])
  async function reply(event: React.FormEvent, questionId: string) {
    event.preventDefault()
    const result = await api.answerLessonQuestion(questionId, replies[questionId] ?? '')
    if (!result.ok) return toast.error(result.error)
    setReplies((current) => ({ ...current, [questionId]: '' }))
    await refresh()
    toast.success('Réponse envoyée à l’élève.')
  }
  return <section className="app-page">
    <header className="page-heading"><div><p className="section-kicker">Échanges avec les élèves</p><h1>Questions à traiter</h1><p>Questions sans réponse sur vos leçons.</p></div></header>
    <label className="form-field">Filtrer par leçon<select value={lessonId} onChange={(event) => setLessonId(event.target.value)}><option value="">Toutes les leçons</option>{lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select></label>
    {items.length === 0 ? <div className="empty-state"><h2>Aucune question en attente</h2><p>Les nouvelles questions apparaîtront ici.</p></div> : items.map(({ question, lessonTitle }) => <article className="admin-table-card relationship-post" key={question.id}>
      <p className="section-kicker">{lessonTitle}</p><p>{question.text}</p>
      <form className="relationship-reply" onSubmit={(event) => void reply(event, question.id)}>
        <label className="form-field">Réponse rapide<textarea value={replies[question.id] ?? ''} onChange={(event) => setReplies((current) => ({ ...current, [question.id]: event.target.value }))} required maxLength={3000}/></label>
        <button className="button-primary" type="submit">Répondre</button>
      </form>
      <button className="button-soft" type="button" onClick={async () => { const result = await api.markLessonQuestionAnswered(question.id); if (!result.ok) toast.error(result.error); else await refresh() }}>Marquer « Répondue »</button>
    </article>)}
  </section>
}

export function TeacherAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<TeacherAnnouncement[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<'followers' | 'subject'>('followers')
  const [subjectId, setSubjectId] = useState('')
  const [pinned, setPinned] = useState(false)
  const refresh = useCallback(async () => {
    const [rows, catalog] = await Promise.all([api.getTeacherAnnouncements(), api.getSubjects()])
    setAnnouncements(rows)
    setSubjects(catalog)
  }, [])
  useEffect(() => { void refresh().catch(() => toast.error('Impossible de charger les annonces.')) }, [refresh])
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const result = await api.publishTeacherAnnouncement({
      title, body, audience: audience === 'followers' ? { type: 'followers' } : { type: 'subject', subjectId }, pinned,
    })
    if (!result.ok) return toast.error(result.error)
    setTitle('')
    setBody('')
    await refresh()
    toast.success('Annonce publiée.')
  }
  return <section className="app-page">
    <header className="page-heading"><div><p className="section-kicker">Actualités de votre classe</p><h1>Annonces</h1><p>Les élèves reçoivent une notification sur EduBac.</p></div></header>
    <form className="admin-table-card relationship-form" onSubmit={(event) => void submit(event)}>
      <label className="form-field">Titre<input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={150}/></label>
      <label className="form-field">Message<textarea value={body} onChange={(event) => setBody(event.target.value)} required maxLength={5000}/></label>
      <label className="form-field">Destinataires<select value={audience} onChange={(event) => setAudience(event.target.value as typeof audience)}><option value="followers">Tous mes abonnés</option><option value="subject">Élèves inscrits à une matière</option></select></label>
      {audience === 'subject' && <label className="form-field">Matière<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} required><option value="">Choisir une matière</option>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.titleFr}</option>)}</select></label>}
      <label><input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)}/> Épingler l’annonce</label>
      <button className="button-primary" type="submit">Publier l’annonce</button>
    </form>
    <section className="admin-table-card"><h2>Mes annonces</h2>{announcements.length ? announcements.map((item) => <article className="relationship-post" key={item.id}><h3>{item.title}{item.pinned ? ' · Épinglée' : ''}</h3><p>{item.body}</p><small>{new Date(item.createdAt).toLocaleDateString('fr-FR')}</small></article>) : <p>Aucune annonce publiée.</p>}</section>
  </section>
}

const sectionValues: Section[] = ['Mathématiques', 'Sciences expérimentales', 'Technique', 'Informatique']

type StudentHomeworkRow = Awaited<ReturnType<typeof api.getMyHomework>>[number]
type TeacherQueueRow = Awaited<ReturnType<typeof api.getTeacherHomeworkQueue>>[number]

export function HomeworkPage() {
  const { user } = useAuth()
  const [studentRows, setStudentRows] = useState<StudentHomeworkRow[]>([])
  const [teacherRows, setTeacherRows] = useState<TeacherQueueRow[]>([])
  const [lessons, setLessons] = useState<Awaited<ReturnType<typeof api.getTeacherLessons>>>([])
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [lessonId, setLessonId] = useState('')
  const [allowedType, setAllowedType] = useState<'text' | 'image' | 'pdf'>('text')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [files, setFiles] = useState<Record<string, HomeworkFile | undefined>>({})
  const [grades, setGrades] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    if (user?.role === 'teacher') {
      const [queue, ownLessons] = await Promise.all([api.getTeacherHomeworkQueue(), api.getTeacherLessons()])
      setTeacherRows(queue)
      setLessons(ownLessons)
    } else {
      setStudentRows(await api.getMyHomework())
    }
    setLoading(false)
  }, [user?.role])
  useEffect(() => { void refresh().catch(() => { setLoading(false); toast.error('Impossible de charger les devoirs.') }) }, [refresh])
  async function createAssignment(event: React.FormEvent) {
    event.preventDefault()
    const result = await api.saveHomeworkAssignment({
      lessonId, title, instructions, dueAt: new Date(dueAt).toISOString(), maxPoints: 20,
      allowedTypes: [allowedType],
    })
    if (!result.ok) return toast.error(result.error)
    setTitle('')
    setInstructions('')
    setDueAt('')
    await refresh()
    toast.success('Devoir publié.')
  }
  async function submitHomework(event: React.FormEvent, assignmentId: string) {
    event.preventDefault()
    const result = await api.submitHomework(assignmentId, {
      ...(answers[assignmentId] ? { text: answers[assignmentId] } : {}),
      ...(files[assignmentId] ? { file: files[assignmentId] } : {}),
    })
    if (!result.ok) return toast.error(result.error)
    await refresh()
    toast.success(result.data.late ? 'Copie rendue après la date limite.' : 'Copie envoyée.')
  }
  async function uploadFile(assignmentId: string, file?: File) {
    if (!file) return
    if (file.size > 3 * 1024 * 1024) return toast.error('Le fichier ne doit pas dépasser 3 Mo.')
    const data = await fileToDataUrl(file)
    const type = file.type as HomeworkFile['type']
    if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(type)) {
      return toast.error('Format de fichier non autorisé.')
    }
    setFiles((current) => ({ ...current, [assignmentId]: { name: file.name, type, data } }))
  }
  async function grade(event: React.FormEvent, submissionId: string) {
    event.preventDefault()
    const result = await api.gradeHomework(submissionId, Number(grades[submissionId]), feedback[submissionId] ?? '')
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    await refresh()
    toast.success('Correction envoyée à l’élève.')
  }
  const isTeacher = user?.role === 'teacher'
  return <section className="app-page">
    <header className="page-heading"><div><p className="section-kicker">Travail personnel</p><h1>{isTeacher ? 'Devoirs à corriger' : 'Mes devoirs'}</h1><p>{isTeacher ? 'Créez un devoir et corrigez les copies reçues.' : 'Retrouvez les consignes, vos copies et les corrections.'}</p></div></header>
    {isTeacher && <form className="admin-table-card relationship-form" onSubmit={(event) => void createAssignment(event)}>
      <h2>Créer un devoir</h2>
      <label className="form-field">Leçon<select value={lessonId} onChange={(event) => setLessonId(event.target.value)} required><option value="">Choisir une leçon</option>{lessons.filter((lesson) => lesson.status === 'published').map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select></label>
      <label className="form-field">Titre<input value={title} onChange={(event) => setTitle(event.target.value)} required/></label>
      <label className="form-field">Consignes<textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} required/></label>
      <label className="form-field">Date limite<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} required/></label>
      <label className="form-field">Type de rendu<select value={allowedType} onChange={(event) => setAllowedType(event.target.value as typeof allowedType)}><option value="text">Texte</option><option value="image">Image (3 Mo maximum)</option><option value="pdf">PDF (3 Mo maximum)</option></select></label>
      <button className="button-primary" type="submit">Publier le devoir</button>
    </form>}
    {loading ? <p role="status">Chargement des devoirs…</p> : isTeacher
      ? teacherRows.length === 0 ? <div className="empty-state"><h2>Aucune copie à corriger</h2><p>Les copies reçues apparaîtront dans cette file.</p></div>
        : teacherRows.map(({ assignment, submission, studentName }) => <HomeworkCorrection key={submission.id} assignment={assignment} submission={submission} studentName={studentName} grades={grades} feedback={feedback} setGrades={setGrades} setFeedback={setFeedback} onSubmit={grade}/>)
      : studentRows.length === 0 ? <div className="empty-state"><h2>Aucun devoir disponible</h2><p>Les devoirs de vos matières apparaîtront ici.</p></div>
        : studentRows.map(({ assignment, submission, status }) => <article className="admin-table-card relationship-post" key={assignment.id}>
          <h2>{assignment.title}</h2><p>{assignment.instructions}</p><p>À rendre le {new Date(assignment.dueAt).toLocaleString('fr-FR')} · <strong>{status}</strong></p>
          {submission?.grade !== undefined ? <p>Note : {submission.grade}/{assignment.maxPoints} · {submission.feedback}</p>
            : <form className="relationship-form" onSubmit={(event) => void submitHomework(event, assignment.id)}>
              {assignment.allowedTypes.includes('text') && <label className="form-field">Votre réponse<textarea value={answers[assignment.id] ?? ''} onChange={(event) => setAnswers((current) => ({ ...current, [assignment.id]: event.target.value }))}/></label>}
              {(assignment.allowedTypes.includes('image') || assignment.allowedTypes.includes('pdf')) && <label className="form-field">Fichier (3 Mo maximum)<input type="file" accept={assignment.allowedTypes.includes('pdf') ? 'application/pdf' : 'image/png,image/jpeg,image/webp'} onChange={(event) => void uploadFile(assignment.id, event.target.files?.[0])}/></label>}
              <button className="button-primary" type="submit">Envoyer ou remplacer ma copie</button>
            </form>}
        </article>)}
  </section>
}

function HomeworkCorrection({
  assignment, submission, studentName, grades, feedback, setGrades, setFeedback, onSubmit,
}: {
  assignment: TeacherQueueRow['assignment']
  submission: HomeworkSubmission
  studentName: string
  grades: Record<string, string>
  feedback: Record<string, string>
  setGrades: React.Dispatch<React.SetStateAction<Record<string, string>>>
  setFeedback: React.Dispatch<React.SetStateAction<Record<string, string>>>
  onSubmit: (event: React.FormEvent, submissionId: string) => Promise<void>
}) {
  return <article className="admin-table-card relationship-post">
    <h2>{assignment.title}{submission.late ? ' · En retard' : ''}</h2>
    <p>Élève : {studentName} · Copie reçue le {new Date(submission.submittedAt).toLocaleString('fr-FR')}</p>
    {submission.text && <p className="relationship-submission-text">{submission.text}</p>}
    {submission.file && <a href={submission.file.data} download={submission.file.name}>Ouvrir la copie : {submission.file.name}</a>}
    <form className="relationship-form" onSubmit={(event) => void onSubmit(event, submission.id)}>
      <label className="form-field">Note sur {assignment.maxPoints}<input type="number" min="0" max={assignment.maxPoints} step="0.5" value={grades[submission.id] ?? ''} onChange={(event) => setGrades((current) => ({ ...current, [submission.id]: event.target.value }))} required/></label>
      <label className="form-field">Retour écrit<textarea value={feedback[submission.id] ?? ''} onChange={(event) => setFeedback((current) => ({ ...current, [submission.id]: event.target.value }))}/></label>
      <button className="button-primary" type="submit">Envoyer la correction</button>
    </form>
  </article>
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Lecture du fichier impossible.'))
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'))
    reader.readAsDataURL(file)
  })
}

type ConversationRow = Awaited<ReturnType<typeof api.getMyConversations>>[number]

export function MessagesPage() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [messages, setMessages] = useState<PrivateMessage[]>([])
  const [text, setText] = useState('')
  const [blocked, setBlocked] = useState(false)
  const refresh = useCallback(async () => {
    const rows = await api.getMyConversations()
    setConversations(rows)
    if (!selectedId && rows[0]) setSelectedId(rows[0].id)
  }, [selectedId])
  useEffect(() => { void refresh().catch(() => toast.error('Impossible de charger la messagerie.')) }, [refresh])
  useEffect(() => {
    if (!selectedId) { setMessages([]); return }
    let active = true
    void Promise.all([
      api.getConversationMessages(selectedId),
      user?.role === 'student' ? api.isConversationMessagingBlocked(selectedId) : Promise.resolve(false),
    ]).then(async ([rows, isBlocked]) => {
      if (!active) return
      setMessages(rows)
      setBlocked(isBlocked)
      for (const message of rows) {
        if (message.recipientId === user?.id && !message.readAt) await api.markPrivateMessageRead(message.id)
      }
      if (active) await refresh()
    }).catch(() => toast.error('Impossible de charger la conversation.'))
    return () => { active = false }
  }, [refresh, selectedId, user?.id, user?.role])
  async function send(event: React.FormEvent) {
    event.preventDefault()
    const result = await api.replyToTeacherConversation(selectedId, text)
    if (!result.ok) return toast.error(result.error)
    setText('')
    await refresh()
    setMessages(await api.getConversationMessages(selectedId))
  }
  async function report(message: PrivateMessage) {
    const result = await api.createReport('message', message.id, 'Message à vérifier')
    if (!result.ok) return toast.error(result.error)
    toast.success('Signalement transmis à la modération.')
  }
  const selected = conversations.find((item) => item.id === selectedId)
  return <section className="app-page">
    <header className="page-heading"><div><p className="section-kicker">Échanges privés et sécurisés</p><h1>Messages</h1><p>Les communications restent dans EduBac. Les coordonnées sont filtrées automatiquement.</p></div></header>
    <div className="relationship-messages">
      <nav className="admin-table-card relationship-conversations" aria-label="Conversations">
        <h2>Conversations</h2>
        {conversations.length === 0 ? <p>Aucune conversation. <Link href="/teachers">Découvrir les professeurs</Link></p>
          : conversations.map((conversation) => <button type="button" className={selectedId === conversation.id ? 'relationship-conversation active' : 'relationship-conversation'} key={conversation.id} onClick={() => { setSelectedId(conversation.id); setBlocked(false) }}>
            <strong>{conversation.participantName}</strong><span>{conversation.lastMessage.text}</span>{conversation.unreadCount > 0 && <b>{conversation.unreadCount} non lu(s)</b>}
          </button>)}
      </nav>
      <section className="admin-table-card relationship-thread" aria-label="Messages de la conversation">
        {selected ? <><div className="relationship-section-heading"><h2>{selected.participantName}</h2>
          {user?.role === 'student' && <button className="button-soft" type="button" onClick={async () => {
            const result = await api.blockTeacherMessaging(selected.participantId, !blocked)
            if (!result.ok) return toast.error(result.error)
            setBlocked(!blocked)
          }}>{blocked ? 'Autoriser les messages' : 'Bloquer les messages'}</button>}</div>
          <div className="relationship-message-list">{messages.map((message) => <article className={message.senderId === user?.id ? 'relationship-message mine' : 'relationship-message'} key={message.id}>
            <p>{message.text}</p>{message.flagged && <small>Message transmis à la modération.</small>}
            <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString('fr-FR')}</time>
            <button type="button" className="button-soft" onClick={() => void report(message)}>Signaler</button>
          </article>)}</div>
          <form className="relationship-form" onSubmit={(event) => void send(event)}>
            <label className="form-field">Votre message<textarea value={text} onChange={(event) => setText(event.target.value)} required maxLength={3000}/></label>
            <button className="button-primary" type="submit">Envoyer</button>
          </form>
        </> : <div className="empty-state"><h2>Choisissez une conversation</h2><p>Vous pouvez écrire à un professeur depuis son profil.</p><Link className="button-soft" href="/teachers">Voir les professeurs</Link></div>}
      </section>
    </div>
  </section>
}

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<Awaited<ReturnType<typeof api.getNotifications>>>([])
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => { setNotifications(await api.getNotifications()); setLoading(false) }, [])
  useEffect(() => { void refresh().catch(() => { setLoading(false); toast.error('Impossible de charger les notifications.') }) }, [refresh])
  async function markAll() {
    const result = await api.markAllNotificationsRead()
    if (!result.ok) return toast.error(result.error)
    await refresh()
  }
  async function markRead(id: string) {
    const result = await api.markNotificationRead(id)
    if (!result.ok) return toast.error(result.error)
    setNotifications((rows) => rows.map((item) => item.id === id ? result.data : item))
  }
  return <section className="app-page">
    <header className="page-heading"><div><p className="section-kicker">Votre activité</p><h1>Notifications</h1><p>Réponses, annonces, corrections et messages importants.</p></div><button className="button-soft" type="button" onClick={() => void markAll()}>Tout marquer comme lu</button></header>
    {loading ? <p role="status">Chargement des notifications…</p>
      : notifications.length === 0 ? <div className="empty-state"><h2>Aucune notification</h2><p>Vous êtes à jour.</p></div>
        : <div className="admin-table-card"><ul className="relationship-notifications">{notifications.map((item) => <li key={item.id} className={item.readAt ? '' : 'is-unread'}>
          <Link href={item.href} onClick={() => { if (!item.readAt) void markRead(item.id) }}><strong>{item.title}</strong><span>{item.message}</span><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('fr-FR')}</time></Link>
        </li>)}</ul></div>}
  </section>
}

export function AdminRelationshipsPage() {
  const [reports, setReports] = useState<Awaited<ReturnType<typeof api.getReports>>>([])
  const [actions, setActions] = useState<Awaited<ReturnType<typeof api.getModerationActions>>>([])
  const [engagement, setEngagement] = useState<Awaited<ReturnType<typeof api.getAdminEngagementReport>>>([])
  const [settings, setSettings] = useState<RelationshipSettings>({
    messagingEnabled: true, messagesPerHour: 10, bannedWords: [], disabledMessagingUserIds: [],
  })
  const [bannedWords, setBannedWords] = useState('')
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    const [reportRows, logs, metrics, currentSettings] = await Promise.all([
      api.getReports(), api.getModerationActions(), api.getAdminEngagementReport(), api.getRelationshipSettings(),
    ])
    setReports(reportRows)
    setActions(logs)
    setEngagement(metrics)
    if (currentSettings) {
      setSettings(currentSettings)
      setBannedWords(currentSettings.bannedWords.join(', '))
    }
    setLoading(false)
  }, [])
  useEffect(() => { void refresh().catch(() => { setLoading(false); toast.error('Impossible de charger la modération.') }) }, [refresh])
  async function moderate(reportId: string, action: 'hide' | 'delete' | 'warn' | 'block-messaging' | 'suspend') {
    const result = await api.moderateReport(reportId, action)
    if (!result.ok) return toast.error(result.error)
    await refresh()
    toast.success('Action de modération enregistrée.')
  }
  async function saveSettings(event: React.FormEvent) {
    event.preventDefault()
    const result = await api.saveRelationshipSettings({
      ...settings, bannedWords: bannedWords.split(',').map((word) => word.trim()).filter(Boolean),
    })
    if (!result.ok) return toast.error(result.error)
    setSettings(result.data)
    toast.success('Paramètres enregistrés.')
  }
  async function updatePercentage(teacherId: string, value: string) {
    const result = await api.setTeacherRevenueShare(teacherId, Number(value))
    if (!result.ok) return toast.error(result.error)
    await refresh()
  }
  return <section className="app-page">
    <header className="page-heading"><div><p className="section-kicker">Sécurité et qualité</p><h1>Modération et engagements</h1><p>Traitez les signalements et gérez les règles de communication.</p></div></header>
    {loading ? <p role="status">Chargement de la modération…</p> : <>
      <section className="admin-table-card"><h2>File de signalements</h2>{reports.filter((report) => report.status === 'pending').length === 0
        ? <p>Aucun signalement en attente.</p>
        : reports.filter((report) => report.status === 'pending').map((report) => <article className="relationship-post" key={report.id}>
          <p><strong>{report.targetType}</strong> · {report.reason}</p><small>Contenu : {report.targetId} · {new Date(report.createdAt).toLocaleString('fr-FR')}</small>
          <div className="relationship-actions">{(['hide', 'delete', 'warn', 'block-messaging', 'suspend'] as const).map((action) => <button className="button-soft" type="button" key={action} onClick={() => void moderate(report.id, action)}>{moderationLabel[action]}</button>)}</div>
        </article>)}
      </section>
      <form className="admin-table-card relationship-form" onSubmit={(event) => void saveSettings(event)}>
        <h2>Paramètres de messagerie</h2>
        <label><input type="checkbox" checked={settings.messagingEnabled} onChange={(event) => setSettings({ ...settings, messagingEnabled: event.target.checked })}/> Messagerie activée</label>
        <label className="form-field">Messages/questions par heure<input type="number" min="1" max="1000" value={settings.messagesPerHour} onChange={(event) => setSettings({ ...settings, messagesPerHour: Number(event.target.value) })}/></label>
        <label className="form-field">Mots à modérer, séparés par des virgules<input value={bannedWords} onChange={(event) => setBannedWords(event.target.value)}/></label>
        <button className="button-primary" type="submit">Enregistrer les paramètres</button>
      </form>
      <section className="admin-table-card"><h2>Engagement par professeur</h2><p>Indicateurs uniquement, aucun calcul financier.</p>
        {engagement.length === 0 ? <p>Aucune donnée enregistrée pour le moment.</p> : engagement.map((row) => <article className="relationship-engagement-row" key={`${row.teacherId}-${row.month}`}>
          <strong>{row.teacherId} · {row.month}</strong><span>{row.videoMinutesWatched.toFixed(1)} min vues</span><span>{row.lessonsCompleted} leçons terminées</span><span>{row.activeStudents} élèves actifs</span>
          <label className="form-field">Pourcentage configurable<input aria-label={`Pourcentage de ${row.teacherId}`} type="number" min="0" max="100" step="0.1" value={row.revenueSharePercentage} onChange={(event) => void updatePercentage(row.teacherId, event.target.value)}/></label>
        </article>)}
      </section>
      <section className="admin-table-card"><h2>Journal des actions</h2>{actions.length === 0 ? <p>Aucune action enregistrée.</p> : actions.map((action) => <p key={action.id}>{action.action} · signalement {action.reportId} · {new Date(action.createdAt).toLocaleString('fr-FR')}</p>)}</section>
    </>}
  </section>
}

const moderationLabel = {
  hide: 'Masquer',
  delete: 'Supprimer',
  warn: 'Avertir',
  'block-messaging': 'Bloquer la messagerie',
  suspend: 'Suspendre le compte',
} as const

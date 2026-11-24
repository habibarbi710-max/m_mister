'use client'

import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Download, ExternalLink, FileText, MessageCircleQuestion, ThumbsUp } from 'lucide-react'
import { toast } from 'sonner'
import * as api from '@/lib/api'
import { useLanguage } from '@/components/shared/language-provider'
import { showApiError, translateApiError } from '@/components/shared/api-error'
import { downloadBlob } from '@/components/shared/download-file'
import type { LiveQuestion, LiveSession, User } from '@/types'

type PanelTab = 'questions' | 'resources'

export function LiveRoomPanels({ session, user, active }: { session: LiveSession; user: User; active: boolean }) {
  const [tab, setTab] = useState<PanelTab>('questions')
  const [questions, setQuestions] = useState<LiveQuestion[]>([])
  const { t } = useLanguage()
  const schema = useMemo(() => z.object({
    text: z.string().trim().min(2, 'Écrivez au moins 2 caractères.').max(500, 'La question ne peut pas dépasser 500 caractères.'),
  }), [])
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<{ text: string }>({
    resolver: zodResolver(schema),
    defaultValues: { text: '' },
  })

  async function refreshQuestions() {
    setQuestions(await api.getLiveQuestions(session.id))
  }

  useEffect(() => {
    let activeEffect = true
    async function load() {
      const rows = await api.getLiveQuestions(session.id)
      if (activeEffect) setQuestions(rows)
    }
    void load().catch(() => toast.error(t('unknownError')))
    const timer = window.setInterval(() => {
      void load().catch(() => toast.error(t('unknownError')))
    }, 5000)
    return () => { activeEffect = false; window.clearInterval(timer) }
  }, [session.id, t])

  async function submit(values: { text: string }) {
    const result = await api.createLiveQuestion(session.id, values.text)
    if (!result.ok) return toast.error(translateApiError(result.error, t))
    reset()
    await refreshQuestions()
  }

  async function vote(question: LiveQuestion) {
    const result = await api.voteLiveQuestion(question.id)
    if (!result.ok) return toast.error(translateApiError(result.error, t))
    setQuestions((current) => current.map((item) => item.id === question.id ? result.data : item))
  }

  async function answer(questionId: string) {
    const result = await api.markLiveQuestionAnswered(questionId)
    if (!result.ok) return toast.error(translateApiError(result.error, t))
    setQuestions((current) => current.map((item) => item.id === questionId ? result.data : item))
  }

  return <aside className="live-room-panel">
    <div className="live-panel-tabs" role="tablist" aria-label="Contenu de la séance">
      <button type="button" role="tab" aria-selected={tab === 'questions'} onClick={() => setTab('questions')}><MessageCircleQuestion aria-hidden="true"/> Questions</button>
      <button type="button" role="tab" aria-selected={tab === 'resources'} onClick={() => setTab('resources')}><FileText aria-hidden="true"/> Ressources</button>
    </div>
    {tab === 'questions' ? <section className="live-panel-content" role="tabpanel">
      {user.role === 'student' && session.status === 'live' && active && <form className="live-question-form" onSubmit={handleSubmit(submit)} noValidate>
        <label htmlFor="live-question">Poser une question</label>
        <textarea id="live-question" rows={3} maxLength={500} placeholder="Votre question pour l’enseignant…" {...register('text')}/>
        {errors.text?.message && <small role="alert">{errors.text.message}</small>}
        <button className="button-primary" type="submit" disabled={isSubmitting}>{isSubmitting ? t('loading') : 'Envoyer la question'}</button>
      </form>}
      <div className="live-questions-list">{questions.length === 0 && <p className="live-panel-empty">Aucune question pour le moment.</p>}
        {questions.map((question) => {
          const voted = question.voterIds.includes(user.id)
          return <article className={`live-question-card${question.answered ? ' is-answered' : ''}`} key={question.id}>
            <p>{question.text}</p>
            <div className="live-question-meta"><span>{new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Tunis', hour: '2-digit', minute: '2-digit' }).format(new Date(question.createdAt))}</span>{question.answered && <span>Répondue</span>}</div>
            <div className="live-question-actions">
              <button type="button" className={voted ? 'live-vote-button is-voted' : 'live-vote-button'} onClick={() => void vote(question)} disabled={user.role !== 'student' || voted}><ThumbsUp aria-hidden="true"/> {question.voterIds.length}</button>
              {(user.role === 'teacher' || user.role === 'admin') && !question.answered && <button className="live-answer-button" type="button" onClick={() => void answer(question.id)}>Marquer comme répondue</button>}
            </div>
          </article>
        })}
      </div>
    </section> : <section className="live-panel-content" role="tabpanel">
      {session.resources.length === 0 ? <p className="live-panel-empty">Aucune ressource n’a été ajoutée à cette séance.</p>
        : <ul className="live-resources-list">{session.resources.map((resource) => <li key={`${resource.title}-${resource.attachment?.storageId ?? resource.url}`}>
          {resource.url ? <a href={resource.url} target="_blank" rel="noreferrer"><FileText aria-hidden="true"/><span>{resource.title}</span><ExternalLink aria-hidden="true"/></a>
            : <button type="button" className="live-resource-download" onClick={async () => {
              if (!resource.attachment) return
              const result = await api.downloadLiveAttachment(session.id, resource.attachment.storageId)
              if (!result.ok) return showApiError(result.error)
              downloadBlob(result.data.blob, result.data.name)
            }}><FileText aria-hidden="true"/><span>{resource.title}</span><Download aria-hidden="true"/></button>}
        </li>)}</ul>}
    </section>}
  </aside>
}

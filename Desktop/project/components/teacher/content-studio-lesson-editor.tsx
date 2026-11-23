'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import type { Lesson, Subject } from '@/types'
import * as api from '@/lib/api'
import { useLanguage } from '@/components/shared/language-provider'
import { translateApiError } from '@/components/shared/api-error'
import { parseVideoUrl } from '@/lib/video/parse'
import { LessonStudioFields } from '@/components/teacher/content-studio-lesson-fields'
import { blankQuestion, fixedChoices, type LessonForm } from '@/components/teacher/content-studio-lesson-types'

export function LessonStudioEditor({ lesson, subject, moduleId, close, saved }: {
  lesson?: Lesson
  subject: Subject
  moduleId: string
  close: () => void
  saved: () => Promise<void>
}) {
  const { t } = useLanguage()
  const schema = useMemo(() => z.object({
    id: z.string(),
    title: z.string(),
    duration: z.number().int().positive(t('required')),
    videoUrl: z.string(),
    videos: z.array(z.object({
      id: z.string(), title: z.string(), provider: z.enum(['bunny', 'vimeo', 'youtube', 'mp4']),
      url: z.string(), durationSeconds: z.number().nonnegative(), order: z.number().int(),
    })),
    summary: z.string(),
    pdfUrl: z.string(),
    exercises: z.array(z.object({ prompt: z.string(), correction: z.string() })),
    quiz: z.object({ id: z.string(), title: z.string(), questions: z.array(z.object({
      id: z.string(), prompt: z.string(), choices: z.tuple([z.string(), z.string(), z.string(), z.string()]),
      answer: z.number().int().min(0).max(3), explanation: z.string(),
    })) }),
    isFree: z.boolean(),
    subjectId: z.string().min(1, t('required')),
    chapterId: z.string().min(1, t('required')),
    status: z.enum(['draft', 'published']),
    order: z.number().int().nonnegative(),
  }).superRefine((values, context) => {
    if (values.status !== 'published') return
    if (values.title.trim().length < 2) context.addIssue({ code: 'custom', path: ['title'], message: t('nameLength') })
    if (values.summary.trim().length < 10) context.addIssue({ code: 'custom', path: ['summary'], message: t('required') })
    if (values.videos.length === 0) context.addIssue({ code: 'custom', path: ['videos'], message: t('videoRequired') })
    values.videos.forEach((video, index) => {
      const parsed = parseVideoUrl(video.url)
      if (!parsed.ok) context.addIssue({ code: 'custom', path: ['videos', index, 'url'], message: parsed.error })
      else if (parsed.data.provider !== video.provider) context.addIssue({ code: 'custom', path: ['videos', index, 'provider'], message: t('videoError') })
      if (!video.title.trim()) context.addIssue({ code: 'custom', path: ['videos', index, 'title'], message: t('required') })
    })
    if (values.exercises.length === 0) context.addIssue({ code: 'custom', path: ['exercises'], message: t('required') })
    values.exercises.forEach((exercise, index) => {
      if (!exercise.prompt.trim()) context.addIssue({ code: 'custom', path: ['exercises', index, 'prompt'], message: t('required') })
      if (!exercise.correction.trim()) context.addIssue({ code: 'custom', path: ['exercises', index, 'correction'], message: t('required') })
    })
    if (!values.quiz.title.trim()) context.addIssue({ code: 'custom', path: ['quiz', 'title'], message: t('required') })
    if (values.quiz.questions.length === 0) context.addIssue({ code: 'custom', path: ['quiz', 'questions'], message: t('required') })
    values.quiz.questions.forEach((question, index) => {
      if (!question.prompt.trim()) context.addIssue({ code: 'custom', path: ['quiz', 'questions', index, 'prompt'], message: t('required') })
      question.choices.forEach((choice, choiceIndex) => {
        if (!choice.trim()) context.addIssue({ code: 'custom', path: ['quiz', 'questions', index, 'choices', choiceIndex], message: t('required') })
      })
      if (!question.explanation.trim()) context.addIssue({ code: 'custom', path: ['quiz', 'questions', index, 'explanation'], message: t('required') })
    })
  }), [t])

  const defaults = useMemo<LessonForm>(() => ({
    id: lesson?.id ?? `lesson-${crypto.randomUUID()}`,
    title: lesson?.title ?? '',
    duration: lesson?.duration ?? 30,
    videoUrl: lesson?.videoUrl ?? '',
    videos: lesson?.videos ?? [],
    summary: lesson?.summary ?? '',
    pdfUrl: lesson?.pdfUrl ?? '',
    exercises: lesson?.exercises.map(({ prompt, correction }) => ({ prompt, correction })) ?? [{ prompt: '', correction: '' }],
    quiz: lesson
      ? { ...lesson.quiz, questions: lesson.quiz.questions.map((question) => ({ ...question, choices: fixedChoices(question.choices) })) }
      : { id: `quiz-${crypto.randomUUID()}`, title: '', questions: [blankQuestion()] },
    isFree: lesson?.isFree ?? false,
    subjectId: subject.id,
    chapterId: moduleId,
    status: lesson?.status ?? 'draft',
    order: lesson?.order ?? 0,
  }), [lesson, moduleId, subject.id])
  const methods = useForm<LessonForm>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  })
  const watchedForm = useWatch({ control: methods.control })
  const { handleSubmit, getValues, reset, setValue, trigger, formState: { isSubmitting, isDirty } } = methods
  const [saveState, setSaveState] = useState<'idle' | 'pending' | 'saved' | 'error'>('idle')
  const [draftLoaded, setDraftLoaded] = useState(false)

  useEffect(() => {
    let active = true
    void api.getLessonDraft(defaults.id).then((draft) => {
      if (!active) return
      if (draft) {
        reset({
          ...defaults,
          ...draft,
          exercises: draft.exercises.map(({ prompt, correction }) => ({ prompt, correction })),
          quiz: {
            ...draft.quiz,
            questions: draft.quiz.questions.map((question) => ({
              ...question,
              choices: fixedChoices(question.choices),
            })),
          },
        })
      }
      setDraftLoaded(true)
    }).catch(() => {
      if (active) {
        setDraftLoaded(true)
        toast.error(t('unknownError'))
      }
    })
    return () => { active = false }
  }, [defaults, reset, t])

  useEffect(() => {
    if (!draftLoaded || !isDirty) return
    setSaveState('pending')
    const timer = window.setTimeout(async () => {
      const current = getValues()
      if (!current.subjectId || !current.chapterId) return
      const draft = { ...current, status: 'draft' as const, videoUrl: current.videos[0]?.url ?? current.videoUrl }
      const result = await api.saveLessonDraft(draft)
      if (!result.ok) {
        setSaveState('error')
        if (result.error.includes('matière') || result.error.includes('module')) return
        toast.error(translateApiError(result.error, t))
        return
      }
      if (JSON.stringify(getValues()) === JSON.stringify(current)) {
        reset({ ...current, status: 'draft' })
        setSaveState('saved')
      } else {
        setSaveState('pending')
      }
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [draftLoaded, getValues, isDirty, reset, t, watchedForm])

  useEffect(() => {
    if (!isDirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isDirty])

  function safeClose() {
    if (isDirty && !window.confirm(t('unsavedWarning'))) return
    close()
  }

  async function submit(form: LessonForm) {
    const result = await api.saveLesson({ ...form, videoUrl: form.videos[0]?.url ?? form.videoUrl })
    if (!result.ok) {
      toast.error(translateApiError(result.error, t))
      return
    }
    reset({ ...form, id: result.data.id })
    setSaveState('saved')
    toast.success(t('saved'))
    await saved()
    close()
  }

  async function saveDraft() {
    const form = getValues()
    const draft = { ...form, status: 'draft' as const, videoUrl: form.videos[0]?.url ?? form.videoUrl }
    const result = await api.saveLessonDraft(draft)
    if (!result.ok) {
      toast.error(translateApiError(result.error, t))
      return
    }
    reset({ ...form, status: 'draft' })
    setSaveState('saved')
    toast.success(t('saved'))
    await saved()
    close()
  }

  async function publish() {
    setValue('status', 'published', { shouldDirty: true, shouldValidate: true })
    if (await trigger()) await handleSubmit(submit)()
  }

  async function uploadPdf(file?: File) {
    if (!file) return
    if (file.type !== 'application/pdf' || file.size > 3 * 1024 * 1024) {
      toast.error(t('pdfError'))
      return
    }
    try {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') setValue('pdfUrl', reader.result, { shouldDirty: true })
        else toast.error(t('unknownError'))
      }
      reader.onerror = () => toast.error(t('unknownError'))
      reader.readAsDataURL(file)
    } catch {
      toast.error(t('unknownError'))
    }
  }

  return <FormProvider {...methods}><div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && safeClose()}>
    <form className="admin-modal lesson-editor content-lesson-editor" onSubmit={(event) => { event.preventDefault(); void saveDraft() }} noValidate>
      <button type="button" className="modal-close" onClick={safeClose}>{t('cancel')}</button>
      <h2>{lesson ? t('editLesson') : t('createLesson')}</h2>
      <p className="autosave-status" role="status">{saveState === 'pending' ? t('savingDraft') : saveState === 'saved' ? t('saved') : saveState === 'error' ? t('draftSaveError') : ''}</p>
      <LessonStudioFields lesson={lesson} uploadPdf={(file) => void uploadPdf(file)}/>
      <footer className="content-editor-footer">
        <button className="button-soft" type="button" disabled={isSubmitting} onClick={() => void saveDraft()}>{isSubmitting ? t('loading') : t('saveDraft')}</button>
        <button className="button-primary" type="button" disabled={isSubmitting} onClick={() => void publish()}>{t('publish')}</button>
      </footer>
    </form>
  </div></FormProvider>
}

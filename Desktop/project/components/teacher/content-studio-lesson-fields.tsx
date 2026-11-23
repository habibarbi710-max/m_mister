'use client'

import { useFieldArray, useFormContext, useWatch } from 'react-hook-form'
import type { Lesson } from '@/types'
import { useLanguage } from '@/components/shared/language-provider'
import { linkVideoStorage } from '@/lib/video/storage'
import { parseVideoUrl } from '@/lib/video/parse'
import { blankQuestion, type LessonForm } from '@/components/teacher/content-studio-lesson-types'

export function LessonStudioFields({ lesson, uploadPdf }: { lesson?: Lesson; uploadPdf: (file?: File) => void }) {
  const { t } = useLanguage()
  const { register, control, setError, setValue, formState: { errors } } = useFormContext<LessonForm>()
  const videoFields = useFieldArray({ control, name: 'videos' })
  const exerciseFields = useFieldArray({ control, name: 'exercises' })
  const questionFields = useFieldArray({ control, name: 'quiz.questions' })
  const values = useWatch({ control })
  const watchedVideos = useWatch({ control, name: 'videos' }) ?? []
  const previewVideo = watchedVideos.map((video) => {
    const parsed = parseVideoUrl(video.url)
    return parsed.ok ? { video, playbackUrl: linkVideoStorage.getPlaybackUrl(video) } : undefined
  }).find((item) => item !== undefined)

  return <>
    <label className="form-field">{t('title')}<input {...register('title')} aria-invalid={Boolean(errors.title)}/>{errors.title?.message && <small role="alert">{errors.title.message}</small>}</label>
    <label className="form-field">{t('duration')}<input type="number" min="1" {...register('duration', { valueAsNumber: true })} aria-invalid={Boolean(errors.duration)}/>{errors.duration?.message && <small role="alert">{errors.duration.message}</small>}</label>
    <label className="form-field">{t('summary')}<textarea rows={5} {...register('summary')} aria-invalid={Boolean(errors.summary)}/>{errors.summary?.message && <small role="alert">{errors.summary.message}</small>}</label>
    {values?.summary && <details className="summary-preview"><summary>{t('preview')}</summary><p>{values.summary}</p></details>}
    <section className="content-editor-section">
      <h3>{t('videos')}</h3>
      {videoFields.fields.map((field, index) => {
        const urlRegistration = register(`videos.${index}.url`)
        return <fieldset className="content-editor-item" key={field.id}>
          <label className="form-field">{t('videoTitle')}<input {...register(`videos.${index}.title`)} aria-invalid={Boolean(errors.videos?.[index]?.title)}/>{errors.videos?.[index]?.title?.message && <small role="alert">{errors.videos[index]?.title?.message}</small>}</label>
          <label className="form-field">{t('videoUrl')}<input {...urlRegistration} aria-invalid={Boolean(errors.videos?.[index]?.url)} onBlur={(event) => {
            urlRegistration.onBlur(event)
            const parsed = parseVideoUrl(event.target.value)
            if (parsed.ok) setValue(`videos.${index}.provider`, parsed.data.provider, { shouldDirty: true })
            else if (event.target.value) setError(`videos.${index}.url`, { message: parsed.error })
          }}/>{errors.videos?.[index]?.url?.message && <small role="alert">{errors.videos[index]?.url?.message}</small>}</label>
          <label className="form-field">{t('videoProvider')}<select {...register(`videos.${index}.provider`)}>{[['youtube', 'YouTube'], ['vimeo', 'Vimeo'], ['bunny', 'Bunny Stream'], ['mp4', 'MP4']].map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label className="form-field">{t('durationSeconds')}<input type="number" min="0" {...register(`videos.${index}.durationSeconds`, { setValueAs: (value: string) => value === '' ? 0 : Number(value) })}/></label>
          <div className="content-editor-actions">
            <button type="button" onClick={() => videoFields.move(index, Math.max(0, index - 1))}>{t('moveUp')}</button>
            <button type="button" onClick={() => videoFields.move(index, Math.min(videoFields.fields.length - 1, index + 1))}>{t('moveDown')}</button>
            <button type="button" onClick={() => videoFields.remove(index)}>{t('delete')}</button>
          </div>
        </fieldset>
      })}
      {errors.videos?.message && <small role="alert">{errors.videos.message}</small>}
      <button type="button" className="button-soft" onClick={() => videoFields.append({
        id: `video-${crypto.randomUUID()}`, title: '', provider: 'youtube', url: '', durationSeconds: 0, order: videoFields.fields.length,
      })}>{t('addVideo')}</button>
      {previewVideo && <div className="video-preview"><h4>{t('livePreview')}</h4>{previewVideo.video.provider === 'mp4'
        ? <video className="lesson-video" src={previewVideo.playbackUrl} controls onLoadedMetadata={(event) => {
          if (!previewVideo.video.durationSeconds) setValue(`videos.${videoFields.fields.findIndex((field) => field.id === previewVideo.video.id)}.durationSeconds`, Math.round(event.currentTarget.duration), { shouldDirty: true })
        }}/>
        : <iframe className="lesson-video" src={previewVideo.playbackUrl} title={t('livePreview')} allowFullScreen/>}</div>}
    </section>
    <section className="content-editor-section">
      <h3>{t('exercises')}</h3>
      {exerciseFields.fields.map((field, index) => <fieldset className="content-editor-item" key={field.id}>
        <label className="form-field">{t('question')}<input {...register(`exercises.${index}.prompt`)} aria-invalid={Boolean(errors.exercises?.[index]?.prompt)}/>{errors.exercises?.[index]?.prompt?.message && <small role="alert">{errors.exercises[index]?.prompt?.message}</small>}</label>
        <label className="form-field">{t('correction')}<textarea {...register(`exercises.${index}.correction`)} aria-invalid={Boolean(errors.exercises?.[index]?.correction)}/>{errors.exercises?.[index]?.correction?.message && <small role="alert">{errors.exercises[index]?.correction?.message}</small>}</label>
        <div className="content-editor-actions">
          <button type="button" onClick={() => exerciseFields.move(index, Math.max(0, index - 1))}>{t('moveUp')}</button>
          <button type="button" onClick={() => exerciseFields.move(index, Math.min(exerciseFields.fields.length - 1, index + 1))}>{t('moveDown')}</button>
          <button type="button" onClick={() => exerciseFields.remove(index)}>{t('delete')}</button>
        </div>
      </fieldset>)}
      {errors.exercises?.message && <small role="alert">{errors.exercises.message}</small>}
      <button type="button" className="button-soft" onClick={() => exerciseFields.append({ prompt: '', correction: '' })}>{t('addExercise')}</button>
    </section>
    <section className="content-editor-section">
      <h3>{t('quiz')}</h3>
      <label className="form-field">{t('title')}<input {...register('quiz.title')} aria-invalid={Boolean(errors.quiz?.title)}/>{errors.quiz?.title?.message && <small role="alert">{errors.quiz.title.message}</small>}</label>
      {questionFields.fields.map((field, index) => <fieldset className="content-editor-item" key={field.id}>
        <label className="form-field">{t('question')}<input {...register(`quiz.questions.${index}.prompt`)} aria-invalid={Boolean(errors.quiz?.questions?.[index]?.prompt)}/>{errors.quiz?.questions?.[index]?.prompt?.message && <small role="alert">{errors.quiz.questions[index]?.prompt?.message}</small>}</label>
        {[0, 1, 2, 3].map((choice) => <label className="form-field" key={choice}>{`${t('choices')} ${choice + 1}`}<input {...register(`quiz.questions.${index}.choices.${choice as 0 | 1 | 2 | 3}`)} aria-invalid={Boolean(errors.quiz?.questions?.[index]?.choices?.[choice])}/>{errors.quiz?.questions?.[index]?.choices?.[choice]?.message && <small role="alert">{errors.quiz.questions[index]?.choices?.[choice]?.message}</small>}</label>)}
        <label className="form-field">{t('answer')}<select {...register(`quiz.questions.${index}.answer`, { valueAsNumber: true })}>{[0, 1, 2, 3].map((answer) => <option value={answer} key={answer}>{answer + 1}</option>)}</select></label>
        <label className="form-field">{t('explanation')}<textarea {...register(`quiz.questions.${index}.explanation`)} aria-invalid={Boolean(errors.quiz?.questions?.[index]?.explanation)}/>{errors.quiz?.questions?.[index]?.explanation?.message && <small role="alert">{errors.quiz.questions[index]?.explanation?.message}</small>}</label>
        <div className="content-editor-actions">
          <button type="button" onClick={() => questionFields.move(index, Math.max(0, index - 1))}>{t('moveUp')}</button>
          <button type="button" onClick={() => questionFields.move(index, Math.min(questionFields.fields.length - 1, index + 1))}>{t('moveDown')}</button>
          <button type="button" onClick={() => questionFields.remove(index)}>{t('delete')}</button>
        </div>
      </fieldset>)}
      {errors.quiz?.message && <small role="alert">{errors.quiz.message}</small>}
      <button type="button" className="button-soft" onClick={() => questionFields.append(blankQuestion())}>{t('addQuestion')}</button>
    </section>
    <label className="form-field">{t('pdfUpload')}<input type="file" accept="application/pdf" onChange={(event) => uploadPdf(event.target.files?.[0])}/></label>
    {values?.pdfUrl && <a href={values.pdfUrl} download={`${lesson?.title || t('lesson')}.pdf`}>{t('downloadPdf')}</a>}
    <label className="form-field">{t('status')}<select {...register('status')}><option value="draft">{t('draft')}</option><option value="published">{t('published')}</option></select></label>
    <label className="form-field content-checkbox"><input type="checkbox" {...register('isFree')}/>{t('isFree')}</label>
  </>
}

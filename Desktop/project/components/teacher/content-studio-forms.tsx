'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import type { Module, Section, Subject } from '@/types'
import * as api from '@/lib/api'
import { useLanguage } from '@/components/shared/language-provider'
import { translateApiError } from '@/components/shared/api-error'
import { toast } from 'sonner'

const sectionValues: Section[] = ['Mathématiques', 'Sciences expérimentales', 'Technique', 'Économie et gestion', 'Informatique', 'Lettres', 'Sport']

export function SubjectEditorForm({ subject, close, saved }: {
  subject?: Subject
  close: () => void
  saved: () => Promise<void>
}) {
  const { t } = useLanguage()
  const schema = useMemo(() => z.object({
    titleFr: z.string().trim().min(2, t('nameLength')),
    description: z.string().trim().min(5, t('required')),
    icon: z.string().trim().min(1, t('required')),
    color: z.string().trim().min(1, t('required')),
    sections: z.array(z.string().trim().min(1)).min(1, t('required')),
    status: z.enum(['draft', 'published']),
  }), [t])
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      titleFr: subject?.titleFr ?? '',
      description: subject?.description ?? '',
      icon: subject?.icon ?? 'book-open',
      color: subject?.color ?? 'indigo',
      sections: subject?.sections ?? [],
      status: subject?.status ?? 'draft',
    },
  })

  async function submit(values: z.infer<typeof schema>) {
    const result = await api.saveSubject({ ...values, id: subject?.id, ownerIds: subject?.ownerIds })
    if (!result.ok) return toast.error(translateApiError(result.error, t))
    toast.success(t('saved'))
    await saved()
    close()
  }

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <form className="admin-modal content-form" onSubmit={handleSubmit(submit)} noValidate>
      <button type="button" className="modal-close" onClick={close}>{t('cancel')}</button>
      <h2>{subject ? t('editSubject') : t('createSubject')}</h2>
      <label className="form-field">{t('title')}<input {...register('titleFr')}/>{errors.titleFr?.message && <small role="alert">{errors.titleFr.message}</small>}</label>
      <label className="form-field">{t('description')}<textarea {...register('description')}/>{errors.description?.message && <small role="alert">{errors.description.message}</small>}</label>
      <label className="form-field">{t('icon')}<input {...register('icon')}/>{errors.icon?.message && <small role="alert">{errors.icon.message}</small>}</label>
      <label className="form-field">{t('color')}<input {...register('color')}/>{errors.color?.message && <small role="alert">{errors.color.message}</small>}</label>
      <fieldset className="content-sections"><legend>{t('targetSections')}</legend>{sectionValues.map((section) => <label key={section}><input type="checkbox" value={section} {...register('sections')}/>{section}</label>)}{errors.sections?.message && <small role="alert">{errors.sections.message}</small>}</fieldset>
      <label className="form-field">{t('status')}<select {...register('status')}><option value="draft">{t('draft')}</option><option value="published">{t('published')}</option></select></label>
      <button className="button-primary" disabled={isSubmitting}>{isSubmitting ? t('loading') : t('save')}</button>
    </form>
  </div>
}

export function ModuleEditorForm({ subjectId, module, order, close, saved }: {
  subjectId: string
  module?: Module
  order: number
  close: () => void
  saved: () => Promise<void>
}) {
  const { t } = useLanguage()
  const schema = useMemo(() => z.object({
    title: z.string().trim().min(2, t('nameLength')),
    description: z.string(),
    order: z.number().int().nonnegative(),
    status: z.enum(['draft', 'published']),
  }), [t])
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { title: module?.title ?? '', description: module?.description ?? '', order: module?.order ?? order, status: module?.status ?? 'draft' },
  })

  async function submit(values: z.infer<typeof schema>) {
    const result = await api.saveModule(subjectId, { ...values, id: module?.id })
    if (!result.ok) return toast.error(translateApiError(result.error, t))
    toast.success(t('saved'))
    await saved()
    close()
  }

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <form className="admin-modal content-form" onSubmit={handleSubmit(submit)} noValidate>
      <button type="button" className="modal-close" onClick={close}>{t('cancel')}</button>
      <h2>{module ? t('editModule') : t('createModule')}</h2>
      <label className="form-field">{t('title')}<input {...register('title')}/>{errors.title?.message && <small role="alert">{errors.title.message}</small>}</label>
      <label className="form-field">{t('description')}<textarea {...register('description')}/></label>
      <label className="form-field">{t('order')}<input type="number" {...register('order', { valueAsNumber: true })}/>{errors.order?.message && <small role="alert">{errors.order.message}</small>}</label>
      <label className="form-field">{t('status')}<select {...register('status')}><option value="draft">{t('draft')}</option><option value="published">{t('published')}</option></select></label>
      <button className="button-primary" disabled={isSubmitting}>{isSubmitting ? t('loading') : t('save')}</button>
    </form>
  </div>
}

'use client'

import { BookOpen, Clock3, FilePlus2, FolderPlus } from 'lucide-react'
import { useLanguage } from '@/components/shared/language-provider'

export function ContentStudioStats({ subjects, modules, lessons, videoMinutes }: {
  subjects: number
  modules: number
  lessons: number
  videoMinutes: number
}) {
  const { t } = useLanguage()

  return <div className="content-studio-stats">
    <article><BookOpen aria-hidden="true"/><span>{t('courses')}</span><strong>{subjects}</strong></article>
    <article><FolderPlus aria-hidden="true"/><span>{t('modules')}</span><strong>{modules}</strong></article>
    <article><FilePlus2 aria-hidden="true"/><span>{t('lessons')}</span><strong>{lessons}</strong></article>
    <article><Clock3 aria-hidden="true"/><span>{t('totalVideoDuration')}</span><strong>{videoMinutes} min</strong></article>
  </div>
}

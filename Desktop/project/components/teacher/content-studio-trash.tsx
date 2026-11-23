'use client'

import { RotateCcw, Trash2 } from 'lucide-react'
import type { ContentTrashItem } from '@/types'
import { useLanguage } from '@/components/shared/language-provider'

export function ContentStudioTrash({ items, restore }: { items: ContentTrashItem[]; restore: (id: string) => void }) {
  const { t } = useLanguage()

  return <section className="content-trash">
    <h2><Trash2 aria-hidden="true"/>{t('trash')}</h2>
    {items.length === 0 ? <p>{t('trashEmpty')}</p> : items.map((item) => <article key={item.id}>
      <span>{item.kind === 'subject' ? item.subject.titleFr : item.kind === 'module' ? item.module.title : item.lesson.title}</span>
      <small>{t('expiresIn30Days')}</small>
      <button type="button" onClick={() => restore(item.id)}><RotateCcw aria-hidden="true"/>{t('restore')}</button>
    </article>)}
  </section>
}

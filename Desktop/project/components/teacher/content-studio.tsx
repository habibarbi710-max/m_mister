'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { BookOpen, ChevronDown, ChevronUp, Copy, FolderPlus, Trash2 } from 'lucide-react'
import type { Lesson, Module, Subject } from '@/types'
import * as api from '@/lib/api'
import { useAuth } from '@/components/shared/auth-provider'
import { useLanguage } from '@/components/shared/language-provider'
import { translateApiError } from '@/components/shared/api-error'
import { LessonStudioEditor } from '@/components/teacher/content-studio-lesson-editor'
import { ModuleEditorForm, SubjectEditorForm } from '@/components/teacher/content-studio-forms'
import { ContentStudioTrash } from '@/components/teacher/content-studio-trash'
import { ContentStudioStats } from '@/components/teacher/content-studio-stats'

type Editor =
  | { kind: 'subject'; subject?: Subject }
  | { kind: 'module'; subjectId: string; module?: Module }
  | { kind: 'lesson'; subjectId: string; moduleId: string; lesson?: Lesson }

export function TeacherContentStudio() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [trash, setTrash] = useState<Awaited<ReturnType<typeof api.getContentTrash>>>([])
  const [selected, setSelected] = useState<string[]>([])
  const [editor, setEditor] = useState<Editor>()
  const [dragged, setDragged] = useState<string>()

  const refresh = useCallback(async () => {
    try {
      const [catalog, owned, deleted] = await Promise.all([api.getSubjects(), api.getTeacherLessons(), api.getContentTrash()])
      setSubjects(catalog)
      setLessons(owned)
      setTrash(deleted)
    } catch {
      toast.error(t('unknownError'))
    }
  }, [t])

  useEffect(() => { void refresh() }, [refresh])
  const lessonIds = useMemo(() => new Set(lessons.map((lesson) => lesson.id)), [lessons])
  const lessonCount = subjects.reduce((total, subject) => total + subject.chapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0), 0)
  const durationSeconds = lessons.reduce((total, lesson) => total + lesson.videos.reduce((sum, video) => sum + video.durationSeconds, 0), 0)

  async function report(result: { ok: boolean; error?: string }) {
    if (!result.ok) {
      toast.error(translateApiError(result.error ?? t('unknownError'), t))
      return false
    }
    await refresh()
    return true
  }

  function dragStart(event: React.DragEvent, id: string) {
    event.stopPropagation()
    setDragged(id)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }

  async function moveSubject(firstId: string, secondId: string) {
    const first = subjects.find((subject) => subject.id === firstId)
    const second = subjects.find((subject) => subject.id === secondId)
    if (!first || !second || !user) return
    const result = await api.reorderSubjects([
      { subjectId: first.id, order: second.order },
      { subjectId: second.id, order: first.order },
    ])
    await report(result)
  }

  async function moveModule(subject: Subject, firstId: string, secondId: string) {
    const first = subject.chapters.find((chapter) => chapter.id === firstId)
    const second = subject.chapters.find((chapter) => chapter.id === secondId)
    if (!first || !second) return
    const result = await api.reorderModules(subject.id, [
      { moduleId: first.id, order: second.order },
      { moduleId: second.id, order: first.order },
    ])
    await report(result)
  }

  async function moveLesson(module: Module, firstId: string, secondId: string) {
    const first = module.lessons.find((lesson) => lesson.id === firstId)
    const second = module.lessons.find((lesson) => lesson.id === secondId)
    if (!first || !second) return
    const result = await api.reorderLessons([
      { lessonId: first.id, order: second.order },
      { lessonId: second.id, order: first.order },
    ])
    await report(result)
  }

  async function removeSubject(subject: Subject) {
    const count = subject.chapters.reduce((total, chapter) => total + chapter.lessons.length, 0)
    if (!window.confirm(`${t('deleteSubjectConfirm')} ${subject.chapters.length} ${t('modules')} et ${count} ${t('lessons')} ?`)) return
    await report(await api.deleteSubject(subject.id))
  }

  async function removeModule(subject: Subject, module: Module) {
    if (!window.confirm(`${t('deleteModuleConfirm')} ${module.lessons.length} ${t('lessons')} ?`)) return
    await report(await api.deleteModule(subject.id, module.id))
  }

  async function removeLesson(lesson: Lesson) {
    if (!window.confirm(t('deleteLessonConfirm'))) return
    await report(await api.deleteLesson(lesson.id))
  }

  async function duplicateLessonItem(id: string) {
    await report(await api.duplicateLesson(id))
  }

  async function bulkStatus(status: 'draft' | 'published') {
    if (selected.length === 0) return
    const result = await api.setLessonsStatus(selected, status)
    if (await report(result)) setSelected([])
  }

  async function restore(id: string) {
    await report(await api.restoreContent(id))
  }

  return <section className="app-page content-studio">
    <header className="page-heading">
      <div><p className="section-kicker">{t('teacherHome')}</p><h1>{t('contentStudio')}</h1><p>{t('contentStudioDescription')}</p></div>
      <button className="button-primary" type="button" onClick={() => setEditor({ kind: 'subject' })}><FolderPlus aria-hidden="true"/>{t('createSubject')}</button>
    </header>
    <ContentStudioStats subjects={subjects.length} modules={subjects.reduce((total, subject) => total + subject.chapters.length, 0)} lessons={lessonCount} videoMinutes={Math.floor(durationSeconds / 60)}/>
    {selected.length > 0 && <div className="content-bulk-actions">
      <span>{selected.length} {t('selected')}</span>
      <button type="button" onClick={() => void bulkStatus('published')}>{t('publishSelected')}</button>
      <button type="button" onClick={() => void bulkStatus('draft')}>{t('unpublishSelected')}</button>
      <button type="button" onClick={() => setSelected([])}>{t('cancel')}</button>
    </div>}
    <div className="content-tree" aria-label={t('contentStudio')}>
      {subjects.map((subject) => {
        const ownsSubject = Boolean(user && subject.ownerIds.includes(user.id))
        return <article className="content-subject" key={subject.id}
          draggable={ownsSubject}
          onDragStart={(event) => dragStart(event, `subject:${subject.id}`)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            const source = event.dataTransfer.getData('text/plain') || dragged
            if (source?.startsWith('subject:')) void moveSubject(source.slice(8), subject.id)
            setDragged(undefined)
          }}>
          <header className="content-tree-heading">
            <div><span className={`content-status content-status--${subject.status}`}>{subject.status === 'draft' ? t('draft') : t('published')}</span><h2>{subject.titleFr}</h2><p>{subject.description}</p></div>
            <div className="content-tree-actions">
              <button type="button" disabled={!ownsSubject} aria-label={t('moveUp')} onClick={() => {
                const owned = subjects.filter((item) => item.ownerIds.includes(user?.id ?? ''))
                const index = owned.findIndex((item) => item.id === subject.id)
                if (index > 0) void moveSubject(owned[index - 1].id, subject.id)
              }}><ChevronUp aria-hidden="true"/></button>
              <button type="button" disabled={!ownsSubject} aria-label={t('moveDown')} onClick={() => {
                const owned = subjects.filter((item) => item.ownerIds.includes(user?.id ?? ''))
                const index = owned.findIndex((item) => item.id === subject.id)
                if (index >= 0 && index < owned.length - 1) void moveSubject(subject.id, owned[index + 1].id)
              }}><ChevronDown aria-hidden="true"/></button>
              <button type="button" onClick={() => setEditor({ kind: 'module', subjectId: subject.id })}>{t('createModule')}</button>
              <button type="button" disabled={!ownsSubject} onClick={() => setEditor({ kind: 'subject', subject })}>{t('edit')}</button>
              <button type="button" onClick={async () => { await report(await api.duplicateSubject(subject.id)) }}><Copy aria-hidden="true"/>{t('duplicate')}</button>
              <button type="button" disabled={!ownsSubject} onClick={() => void removeSubject(subject)}><Trash2 aria-hidden="true"/>{t('delete')}</button>
            </div>
          </header>
          <div className="content-module-list">
            {subject.chapters.map((module) => {
              const ownsModule = Boolean(user && module.ownerId === user.id)
              return <section className="content-module" key={module.id}
                draggable={ownsModule}
                onDragStart={(event) => dragStart(event, `module:${module.id}`)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  const source = event.dataTransfer.getData('text/plain') || dragged
                  if (source?.startsWith('module:')) void moveModule(subject, source.slice(7), module.id)
                  setDragged(undefined)
                }}>
                <header className="content-module-heading">
                  <div><span className={`content-status content-status--${module.status}`}>{module.status === 'draft' ? t('draft') : t('published')}</span><h3>{module.title}</h3><small>{module.lessons.length} {t('lessons')}</small></div>
                  <div className="content-tree-actions">
                    <button type="button" disabled={!ownsModule} aria-label={t('moveUp')} onClick={() => {
                      const own = subject.chapters.filter((item) => item.ownerId === user?.id)
                      const index = own.findIndex((item) => item.id === module.id)
                      if (index > 0) void moveModule(subject, own[index - 1].id, module.id)
                    }}><ChevronUp aria-hidden="true"/></button>
                    <button type="button" disabled={!ownsModule} aria-label={t('moveDown')} onClick={() => {
                      const own = subject.chapters.filter((item) => item.ownerId === user?.id)
                      const index = own.findIndex((item) => item.id === module.id)
                      if (index >= 0 && index < own.length - 1) void moveModule(subject, module.id, own[index + 1].id)
                    }}><ChevronDown aria-hidden="true"/></button>
                    <button type="button" onClick={() => setEditor({ kind: 'lesson', subjectId: subject.id, moduleId: module.id })}>{t('createLesson')}</button>
                    <button type="button" disabled={!ownsModule} onClick={() => setEditor({ kind: 'module', subjectId: subject.id, module })}>{t('edit')}</button>
                    <button type="button" disabled={!ownsModule} onClick={async () => { await report(await api.duplicateModule(subject.id, module.id)) }}><Copy aria-hidden="true"/>{t('duplicate')}</button>
                    <button type="button" disabled={!ownsModule} onClick={() => void removeModule(subject, module)}><Trash2 aria-hidden="true"/>{t('delete')}</button>
                  </div>
                </header>
                <div className="content-lesson-list">
                  {[...module.lessons].sort((a, b) => a.order - b.order).map((lesson) => {
                    const ownsLesson = lessonIds.has(lesson.id)
                    return <article className="content-lesson-row" key={lesson.id}
                      draggable={ownsLesson}
                      onDragStart={(event) => dragStart(event, `lesson:${lesson.id}`)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault()
                        const source = event.dataTransfer.getData('text/plain') || dragged
                        if (source?.startsWith('lesson:')) void moveLesson(module, source.slice(7), lesson.id)
                        setDragged(undefined)
                      }}>
                      <label className="content-select"><input type="checkbox" checked={selected.includes(lesson.id)} disabled={!ownsLesson} onChange={(event) => setSelected((current) => event.target.checked ? [...current, lesson.id] : current.filter((id) => id !== lesson.id))}/><span className={`content-status content-status--${lesson.status}`}>{lesson.status === 'draft' ? t('draft') : t('published')}</span></label>
                      <div className="content-lesson-copy"><strong>{lesson.title || t('untitledLesson')}</strong><small>{lesson.duration} min · {lesson.isFree ? t('free') : t('paid')} · {lesson.videos.length} {t('videos')}</small></div>
                      <div className="content-tree-actions">
                        <button type="button" disabled={!ownsLesson} aria-label={t('moveUp')} onClick={() => {
                          const own = module.lessons.filter((item) => lessonIds.has(item.id)).sort((a, b) => a.order - b.order)
                          const index = own.findIndex((item) => item.id === lesson.id)
                          if (index > 0) void moveLesson(module, own[index - 1].id, lesson.id)
                        }}><ChevronUp aria-hidden="true"/></button>
                        <button type="button" disabled={!ownsLesson} aria-label={t('moveDown')} onClick={() => {
                          const own = module.lessons.filter((item) => lessonIds.has(item.id)).sort((a, b) => a.order - b.order)
                          const index = own.findIndex((item) => item.id === lesson.id)
                          if (index >= 0 && index < own.length - 1) void moveLesson(module, lesson.id, own[index + 1].id)
                        }}><ChevronDown aria-hidden="true"/></button>
                        <button type="button" disabled={!ownsLesson} onClick={() => setEditor({ kind: 'lesson', subjectId: subject.id, moduleId: module.id, lesson })}>{t('edit')}</button>
                        {ownsLesson && <Link href={`/lessons/${lesson.id}?preview=1`}>{t('preview')}</Link>}
                        <button type="button" disabled={!ownsLesson} onClick={() => void duplicateLessonItem(lesson.id)}><Copy aria-hidden="true"/>{t('duplicate')}</button>
                        <button type="button" disabled={!ownsLesson} onClick={() => void removeLesson(lesson)}><Trash2 aria-hidden="true"/>{t('delete')}</button>
                      </div>
                    </article>
                  })}
                </div>
              </section>
            })}
            {subject.chapters.length === 0 && <p className="content-empty">{t('noModulesYet')}</p>}
          </div>
        </article>
      })}
      {subjects.length === 0 && <div className="empty-state"><BookOpen aria-hidden="true"/><h2>{t('noData')}</h2><p>{t('createSubjectFirst')}</p></div>}
    </div>
    <ContentStudioTrash items={trash} restore={(id) => void restore(id)}/>
    {editor?.kind === 'subject' && <SubjectEditorForm subject={editor.subject} close={() => setEditor(undefined)} saved={refresh}/>}
    {editor?.kind === 'module' && <ModuleEditorForm subjectId={editor.subjectId} module={editor.module} order={subjects.find((item) => item.id === editor.subjectId)?.chapters.length ?? 0} close={() => setEditor(undefined)} saved={refresh}/>}
    {editor?.kind === 'lesson' && subjects.find((item) => item.id === editor.subjectId) && <LessonStudioEditor lesson={editor.lesson} subject={subjects.find((item) => item.id === editor.subjectId)!} moduleId={editor.moduleId} close={() => setEditor(undefined)} saved={refresh}/>}
  </section>
}

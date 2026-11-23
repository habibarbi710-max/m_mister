'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { Exam, Lesson, Module, Subject, User } from '@/types'
import * as api from '@/lib/api'
import { useLanguage } from '@/components/shared/language-provider'
import { translateApiError } from '@/components/shared/api-error'
import { LessonStudioEditor } from '@/components/teacher/content-studio-lesson-editor'
import { ModuleEditorForm, SubjectEditorForm } from '@/components/teacher/content-studio-forms'

type StatusFilter = 'all' | 'draft' | 'published'
type ContentAction = { ok: boolean; error?: string } | Promise<{ ok: boolean; error?: string }>
type AdminEditor =
  | { kind: 'subject'; subject: Subject }
  | { kind: 'module'; subjectId: string; module: Module }
  | { kind: 'lesson'; subjectId: string; moduleId: string; lesson: Lesson }

export function AdminContentManagement({ subjects, users, refresh }: {
  subjects: Subject[]
  users: User[]
  refresh: () => Promise<void>
}) {
  const { t } = useLanguage()
  const [exams, setExams] = useState<Exam[]>([])
  const [teacherId, setTeacherId] = useState('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [editor, setEditor] = useState<AdminEditor>()
  const teachers = useMemo(() => users.filter((user) => user.role === 'teacher'), [users])

  useEffect(() => {
    void api.getExams().then(setExams).catch(() => toast.error(t('unknownError')))
  }, [t, subjects])

  async function handle(result: ContentAction) {
    const resolved = await result
    if (!resolved.ok) {
      toast.error(translateApiError(resolved.error ?? t('unknownError'), t))
      return
    }
    await Promise.all([refresh(), api.getExams().then(setExams)])
    toast.success(t('saved'))
  }

  async function refreshContent() {
    await refresh()
    setExams(await api.getExams())
  }

  function visible(ownerIds: string[], itemStatus: 'draft' | 'published') {
    return (teacherId === 'all' || ownerIds.includes(teacherId)) && (status === 'all' || status === itemStatus)
  }

  function subjectHasVisibleContent(subject: Subject) {
    if (teacherId === 'all' && status === 'all') return true
    const ownStatus = visible(subject.ownerIds, subject.status)
    const moduleStatus = subject.chapters.some((module) => visible([module.ownerId], module.status)
      || module.lessons.some((lesson) => visible([lesson.ownerId], lesson.status)))
    return ownStatus || moduleStatus
  }

  function ownerName(id: string) {
    return teachers.find((teacher) => teacher.id === id)?.name ?? t('unknownOwner')
  }

  return <section className="admin-content-management">
    <div className="content-filter-bar">
      <label>{t('teacher')}<select value={teacherId} onChange={(event) => setTeacherId(event.target.value)}><option value="all">{t('all')}</option>{teachers.map((teacher) => <option value={teacher.id} key={teacher.id}>{teacher.name}</option>)}</select></label>
      <label>{t('status')}<select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}><option value="all">{t('all')}</option><option value="draft">{t('draft')}</option><option value="published">{t('published')}</option></select></label>
    </div>
    <h2>{t('subjects')}</h2>
    <div className="admin-content-items">
      {subjects.filter(subjectHasVisibleContent).map((subject) => <article className="admin-content-item" key={subject.id}>
        <div><span className={`content-status content-status--${subject.status}`}>{subject.status === 'draft' ? t('draft') : t('published')}</span><h3>{subject.titleFr}</h3><small>{t('owner')}: {subject.ownerIds.map(ownerName).join(', ')}</small></div>
        <label>{t('reassignOwner')}<select value={subject.ownerIds[0] ?? ''} onChange={(event) => void handle(api.setContentOwner('subject', '', subject.id, event.target.value))}><option value="">{t('teacher')}</option>{teachers.map((teacher) => <option value={teacher.id} key={teacher.id}>{teacher.name}</option>)}</select></label>
        <div className="content-tree-actions">
          <button type="button" onClick={() => setEditor({ kind: 'subject', subject })}>{t('edit')}</button>
          <button type="button" onClick={() => void handle(api.setContentStatus('subject', '', subject.id, subject.status === 'published' ? 'draft' : 'published'))}>{subject.status === 'published' ? t('unpublish') : t('publish')}</button>
          <button type="button" onClick={async () => {
            if (!window.confirm(`${t('deleteSubjectConfirm')} ${subject.chapters.length} ${t('modules')} ?`)) return
            await handle(await api.deleteSubject(subject.id))
          }}>{t('delete')}</button>
        </div>
        {subject.chapters.map((module) => visible([module.ownerId], module.status) && <div className="admin-content-child" key={module.id}>
          <div><span className={`content-status content-status--${module.status}`}>{module.status === 'draft' ? t('draft') : t('published')}</span><strong>{module.title}</strong><small>{t('owner')}: {ownerName(module.ownerId)}</small></div>
          <label>{t('reassignOwner')}<select value={module.ownerId} onChange={(event) => void handle(api.setContentOwner('module', subject.id, module.id, event.target.value))}>{teachers.map((teacher) => <option value={teacher.id} key={teacher.id}>{teacher.name}</option>)}</select></label>
          <div className="content-tree-actions">
            <button type="button" onClick={() => setEditor({ kind: 'module', subjectId: subject.id, module })}>{t('edit')}</button>
            <button type="button" onClick={() => void handle(api.setContentStatus('module', subject.id, module.id, module.status === 'published' ? 'draft' : 'published'))}>{module.status === 'published' ? t('unpublish') : t('publish')}</button>
            <button type="button" onClick={async () => {
              if (!window.confirm(`${t('deleteModuleConfirm')} ${module.lessons.length} ${t('lessons')} ?`)) return
              await handle(await api.deleteModule(subject.id, module.id))
            }}>{t('delete')}</button>
          </div>
          {module.lessons.filter((lesson) => visible([lesson.ownerId], lesson.status)).map((lesson) => <LessonAdminRow
            key={lesson.id} lesson={lesson} subject={subject} users={teachers} ownerName={ownerName} onResult={handle}
            onEdit={() => setEditor({ kind: 'lesson', subjectId: subject.id, moduleId: module.id, lesson })}/>)}
        </div>)}
      </article>)}
      {subjects.length === 0 && <p>{t('noData')}</p>}
    </div>
    <h2>{t('exams')}</h2>
    <div className="admin-content-items">{exams.filter((exam) => visible([exam.ownerId], exam.status)).map((exam) => <article className="admin-content-item" key={exam.id}>
      <div><span className={`content-status content-status--${exam.status}`}>{exam.status === 'draft' ? t('draft') : t('published')}</span><h3>{exam.session} · {exam.year}</h3><small>{t('owner')}: {ownerName(exam.ownerId)}</small></div>
      <label>{t('reassignOwner')}<select value={exam.ownerId} onChange={(event) => void handle(api.setContentOwner('exam', '', exam.id, event.target.value))}>{teachers.map((teacher) => <option value={teacher.id} key={teacher.id}>{teacher.name}</option>)}</select></label>
      <div className="content-tree-actions">
        <button type="button" onClick={() => void handle(api.setContentStatus('exam', exam.subjectId, exam.id, exam.status === 'published' ? 'draft' : 'published'))}>{exam.status === 'published' ? t('unpublish') : t('publish')}</button>
        <button type="button" onClick={async () => { if (window.confirm(t('deleteExamConfirm'))) await handle(await api.deleteExam(exam.id)) }}>{t('delete')}</button>
      </div>
    </article>)}
      {exams.length === 0 && <p>{t('noData')}</p>}
    </div>
    {editor?.kind === 'subject' && <SubjectEditorForm subject={editor.subject} close={() => setEditor(undefined)} saved={refreshContent}/>}
    {editor?.kind === 'module' && <ModuleEditorForm subjectId={editor.subjectId} module={editor.module} order={editor.module.order} close={() => setEditor(undefined)} saved={refreshContent}/>}
    {editor?.kind === 'lesson' && subjects.find((subject) => subject.id === editor.subjectId) && <LessonStudioEditor
      lesson={editor.lesson} subject={subjects.find((subject) => subject.id === editor.subjectId)!} moduleId={editor.moduleId}
      close={() => setEditor(undefined)} saved={refreshContent}/>}
  </section>
}

function LessonAdminRow({ lesson, subject, users, ownerName, onResult, onEdit }: {
  lesson: Lesson
  subject: Subject
  users: User[]
  ownerName: (id: string) => string
  onResult: (result: ContentAction) => Promise<void>
  onEdit: () => void
}) {
  const { t } = useLanguage()
  return <div className="admin-content-child admin-content-lesson">
    <div><span className={`content-status content-status--${lesson.status}`}>{lesson.status === 'draft' ? t('draft') : t('published')}</span><strong>{lesson.title}</strong><small>{t('owner')}: {ownerName(lesson.ownerId)}</small></div>
    <label>{t('reassignOwner')}<select value={lesson.ownerId} onChange={(event) => void onResult(api.setContentOwner('lesson', subject.id, lesson.id, event.target.value))}>{users.map((teacher) => <option value={teacher.id} key={teacher.id}>{teacher.name}</option>)}</select></label>
    <div className="content-tree-actions">
      <button type="button" onClick={onEdit}>{t('edit')}</button>
      <button type="button" onClick={() => void onResult(api.setContentStatus('lesson', subject.id, lesson.id, lesson.status === 'published' ? 'draft' : 'published'))}>{lesson.status === 'published' ? t('unpublish') : t('publish')}</button>
      <button type="button" onClick={async () => { if (window.confirm(t('deleteLessonConfirm'))) await onResult(await api.deleteLesson(lesson.id)) }}>{t('delete')}</button>
    </div>
  </div>
}

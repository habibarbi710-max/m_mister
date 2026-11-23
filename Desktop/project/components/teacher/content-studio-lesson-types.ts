import type { LessonVideo } from '@/types'

export type VideoForm = LessonVideo
export type QuestionForm = { id: string; prompt: string; choices: [string, string, string, string]; answer: number; explanation: string }
export type LessonForm = {
  id: string
  title: string
  duration: number
  videoUrl: string
  videos: VideoForm[]
  summary: string
  pdfUrl: string
  exercises: Array<{ prompt: string; correction: string }>
  quiz: { id: string; title: string; questions: QuestionForm[] }
  isFree: boolean
  subjectId: string
  chapterId: string
  status: 'draft' | 'published'
  order: number
}

export function blankQuestion(): QuestionForm {
  return { id: `question-${crypto.randomUUID()}`, prompt: '', choices: ['', '', '', ''], answer: 0, explanation: '' }
}

export function fixedChoices(choices: string[]): QuestionForm['choices'] {
  return [choices[0] ?? '', choices[1] ?? '', choices[2] ?? '', choices[3] ?? '']
}

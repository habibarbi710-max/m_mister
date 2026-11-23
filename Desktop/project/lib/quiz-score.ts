import type { Question } from '@/types'

export function calculateQuizScore(questions: Question[], answers: number[]) {
  const correct = questions.reduce(
    (total, question, index) => total + Number(answers[index] === question.answer),
    0,
  )

  return {
    correct,
    total: questions.length,
    percentage: questions.length === 0 ? 0 : Math.round((correct / questions.length) * 100),
  }
}

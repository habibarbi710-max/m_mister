import type { GroupAssessmentType } from '@/types'

export type GradeValue = {
  score?: number
  maxPoints: number
  coefficient: number
  type: GroupAssessmentType
  absent: boolean
}

export type GradeWeights = Partial<Record<GroupAssessmentType, number>>

export function calculateGroupAverage(grades: GradeValue[], weights: GradeWeights = {}): number | null {
  const counted = grades.filter((grade) => !grade.absent && grade.score !== undefined)
  if (counted.length === 0) return null
  let weightedTotal = 0
  let totalWeight = 0
  for (const grade of counted) {
    const score = grade.score
    if (score === undefined || !Number.isFinite(score) || score < 0 || score > grade.maxPoints
      || !Number.isFinite(grade.maxPoints) || grade.maxPoints <= 0) {
      throw new RangeError('La note doit être comprise entre 0 et le barème.')
    }
    const weight = weights[grade.type] ?? grade.coefficient
    if (!Number.isFinite(weight) || weight <= 0) throw new RangeError('Le coefficient doit être positif.')
    weightedTotal += score / grade.maxPoints * 20 * weight
    totalWeight += weight
  }
  return Math.round((weightedTotal / totalWeight) * 100) / 100
}

export function getGradeDistribution(scores: number[]): [number, number, number, number] {
  const buckets: [number, number, number, number] = [0, 0, 0, 0]
  for (const score of scores) {
    if (!Number.isFinite(score) || score < 0 || score > 20) continue
    const bucket = Math.min(3, Math.floor(score / 5))
    buckets[bucket] += 1
  }
  return buckets
}

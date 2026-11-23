import type { AvailabilityVote, LiveSession, SchedulePollVote, User, WeeklySlot } from '@/types'

export type SlotResult = {
  slot: WeeklySlot
  availableCount: number
  necessaryCount: number
  unavailableCount: number
  availableStudents: string[]
}

function tunisDate(now: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Tunis',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` }
}

export function generateWeeklySessionDates(
  slot: Pick<WeeklySlot, 'dayOfWeek' | 'startTime'>,
  weeks: number,
  now: Date,
): string[] {
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52
    || !Number.isInteger(slot.dayOfWeek) || slot.dayOfWeek < 0 || slot.dayOfWeek > 6
    || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(slot.startTime)) {
    throw new RangeError('Les paramètres de récurrence sont invalides.')
  }
  const local = tunisDate(now)
  const date = new Date(`${local.date}T00:00:00.000Z`)
  let daysUntil = (slot.dayOfWeek - date.getUTCDay() + 7) % 7
  if (daysUntil === 0 && slot.startTime <= local.time) daysUntil = 7
  date.setUTCDate(date.getUTCDate() + daysUntil)
  return Array.from({ length: weeks }, (_, index) => {
    const occurrence = new Date(date)
    occurrence.setUTCDate(date.getUTCDate() + index * 7)
    return occurrence.toISOString().slice(0, 10)
  })
}

export function rankWeeklySlots(
  slots: WeeklySlot[],
  votes: SchedulePollVote[],
  students: User[],
): SlotResult[] {
  const studentNames = new Map(students.map((student) => [student.id, privateStudentName(student.name)]))
  const bySlot = new Map<string, Map<string, AvailabilityVote>>()
  for (const vote of votes) {
    const entries = bySlot.get(vote.slotId) ?? new Map<string, AvailabilityVote>()
    entries.set(vote.studentId, vote.vote)
    bySlot.set(vote.slotId, entries)
  }
  return slots.map((slot) => {
    const responses = bySlot.get(slot.id) ?? new Map<string, AvailabilityVote>()
    const availableStudents = [...responses]
      .filter(([studentId, vote]) => vote === 'Disponible' && studentNames.has(studentId))
      .map(([studentId]) => studentNames.get(studentId)!)
    return {
      slot,
      availableCount: [...responses.values()].filter((vote) => vote === 'Disponible').length,
      necessaryCount: [...responses.values()].filter((vote) => vote === 'Si nécessaire').length,
      unavailableCount: [...responses.values()].filter((vote) => vote === 'Indisponible').length,
      availableStudents,
    }
  }).sort((a, b) => b.availableCount - a.availableCount || b.necessaryCount - a.necessaryCount)
}

export function suggestBestWeeklySlot(results: SlotResult[]): WeeklySlot | undefined {
  return results[0]?.slot
}

export function hasSessionConflict(
  candidate: Pick<LiveSession, 'date' | 'startTime' | 'durationMinutes'>,
  existing: Array<Pick<LiveSession, 'date' | 'startTime' | 'durationMinutes'>>,
): boolean {
  const start = toMinutes(candidate.startTime)
  return existing.some((session) => {
    if (session.date !== candidate.date) return false
    const otherStart = toMinutes(session.startTime)
    return start < otherStart + session.durationMinutes && otherStart < start + candidate.durationMinutes
  })
}

export function privateStudentName(fullName: string): string {
  const [firstName = '', ...familyNames] = fullName.trim().split(/\s+/)
  return familyNames.length ? `${firstName} ${familyNames[familyNames.length - 1].slice(0, 1)}.` : firstName
}

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

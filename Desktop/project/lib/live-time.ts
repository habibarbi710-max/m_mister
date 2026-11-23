import type { LiveSession } from '@/types'

export function liveSessionStart(session: Pick<LiveSession, 'date' | 'startTime'>): Date {
  return new Date(`${session.date}T${session.startTime}:00+01:00`)
}

export function formatLiveSessionDate(session: Pick<LiveSession, 'date' | 'startTime'>): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Tunis',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(liveSessionStart(session))
}

export function toCalendarTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

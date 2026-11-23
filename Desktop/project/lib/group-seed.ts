import type {
  BacSection,
  ClassGroup,
  ClassLogEntry,
  GroupAnnouncement,
  GroupAssessment,
  GroupAttendance,
  GroupContentLink,
  GroupEnrollment,
  GroupPayment,
  GroupRescheduleRequest,
  SchedulePoll,
  SchedulePollVote,
  StudentGrade,
} from '@/types'
import type { LiveSession } from '@/types'

const createdAt = '2026-01-01T00:00:00.000Z'

export const demoSections: BacSection[] = [
  { id: 'math', name: 'Mathématiques', order: 0, active: true },
  { id: 'science', name: 'Sciences expérimentales', order: 1, active: true },
  { id: 'technical', name: 'Technique', order: 2, active: true },
  { id: 'economy', name: 'Économie et gestion', order: 3, active: true },
  { id: 'computer-science', name: 'Informatique', order: 4, active: true },
  { id: 'letters', name: 'Lettres', order: 5, active: true },
  { id: 'sport', name: 'Sport', order: 6, active: true },
]

export const demoGroups: ClassGroup[] = [
  {
    id: 'group-math-math',
    name: 'Bac Mathématiques - Math',
    sectionId: 'math',
    subjectId: 'math',
    teacherId: 'teacher-1',
    maxStudents: 8,
    description: 'Un accompagnement régulier en analyse, algèbre et méthodes de résolution pour le Bac.',
    monthlyPrice: null,
    status: 'ouvert aux inscriptions',
    scheduleStatus: 'fixé',
    createdAt,
  },
  {
    id: 'group-math-physics',
    name: 'Bac Mathématiques - Physique',
    sectionId: 'math',
    subjectId: 'physics',
    teacherId: 'teacher-2',
    maxStudents: 8,
    description: 'Séances de physique avec exercices progressifs et préparation aux épreuves.',
    monthlyPrice: null,
    status: 'ouvert aux inscriptions',
    scheduleStatus: 'proposé',
    createdAt,
  },
  {
    id: 'group-technical-physics',
    name: 'Bac Technique - Physique',
    sectionId: 'technical',
    subjectId: 'physics',
    teacherId: 'teacher-3',
    maxStudents: 8,
    description: 'Révisions de physique appliquée et entraînement aux sujets du Bac Technique.',
    monthlyPrice: null,
    status: 'ouvert aux inscriptions',
    scheduleStatus: 'en attente',
    createdAt,
  },
  {
    id: 'group-science-math',
    name: 'Bac Sciences expérimentales - Math',
    sectionId: 'science',
    subjectId: 'math',
    teacherId: 'teacher-2',
    maxStudents: 8,
    description: 'Consolidez les notions essentielles et entraînez-vous sur des exercices type Bac.',
    monthlyPrice: null,
    status: 'ouvert aux inscriptions',
    scheduleStatus: 'en attente',
    createdAt,
  },
]

export const demoGroupEnrollments: GroupEnrollment[] = [
  { id: 'enrollment-1', studentId: 'student-1', groupId: 'group-math-math', status: 'accepté', requestedAt: createdAt, decidedAt: createdAt },
  { id: 'enrollment-2', studentId: 'student-2', groupId: 'group-math-math', status: 'accepté', requestedAt: createdAt, decidedAt: createdAt },
  { id: 'enrollment-3', studentId: 'student-3', groupId: 'group-math-math', status: 'en attente', requestedAt: createdAt },
  { id: 'enrollment-4', studentId: 'student-4', groupId: 'group-math-physics', status: 'accepté', requestedAt: createdAt, decidedAt: createdAt },
  { id: 'enrollment-5', studentId: 'student-5', groupId: 'group-math-physics', status: 'accepté', requestedAt: createdAt, decidedAt: createdAt },
  { id: 'enrollment-6', studentId: 'student-6', groupId: 'group-math-physics', status: 'en attente', requestedAt: createdAt },
  { id: 'enrollment-7', studentId: 'student-7', groupId: 'group-technical-physics', status: 'accepté', requestedAt: createdAt, decidedAt: createdAt },
  { id: 'enrollment-8', studentId: 'student-8', groupId: 'group-technical-physics', status: 'refusé', requestedAt: createdAt, decidedAt: createdAt, decisionReason: 'Les inscriptions de démonstration sont clôturées.' },
  { id: 'enrollment-9', studentId: 'student-9', groupId: 'group-science-math', status: 'accepté', requestedAt: createdAt, decidedAt: createdAt },
  { id: 'enrollment-10', studentId: 'student-10', groupId: 'group-science-math', status: 'en attente', requestedAt: createdAt },
  { id: 'enrollment-11', studentId: 'student-11', groupId: 'group-math-math', status: 'accepté', requestedAt: createdAt, decidedAt: createdAt },
  { id: 'enrollment-12', studentId: 'student-12', groupId: 'group-technical-physics', status: 'accepté', requestedAt: createdAt, decidedAt: createdAt },
]

export const demoGroupContentLinks: GroupContentLink[] = [
  { id: 'group-content-math-m1', groupId: 'group-math-math', moduleId: 'm1', lessonIds: ['lesson-1', 'lesson-2', 'lesson-3', 'lesson-4'], order: 0, published: true },
]

export const demoSchedulePolls: SchedulePoll[] = [
  {
    id: 'poll-math-fixed',
    groupId: 'group-math-math',
    teacherId: 'teacher-1',
    slots: [
      { id: 'slot-math-sunday', dayOfWeek: 0, startTime: '17:00', durationMinutes: 90 },
      { id: 'slot-math-tuesday', dayOfWeek: 2, startTime: '19:00', durationMinutes: 90 },
      { id: 'slot-math-thursday', dayOfWeek: 4, startTime: '18:00', durationMinutes: 90 },
    ],
    deadlineAt: '2026-01-05T00:00:00.000Z',
    status: 'fixé',
    selectedSlotIds: ['slot-math-sunday'],
    weeks: 12,
    createdAt,
  },
  {
    id: 'poll-physics-open',
    groupId: 'group-math-physics',
    teacherId: 'teacher-2',
    slots: [
      { id: 'slot-physics-monday', dayOfWeek: 1, startTime: '18:00', durationMinutes: 90 },
      { id: 'slot-physics-wednesday', dayOfWeek: 3, startTime: '19:00', durationMinutes: 90 },
      { id: 'slot-physics-saturday', dayOfWeek: 6, startTime: '10:00', durationMinutes: 90 },
    ],
    deadlineAt: '2026-12-01T18:00:00.000Z',
    status: 'ouvert',
    selectedSlotIds: [],
    weeks: 12,
    createdAt,
  },
]

export const demoSchedulePollVotes: SchedulePollVote[] = [
  { pollId: 'poll-math-fixed', slotId: 'slot-math-sunday', studentId: 'student-1', vote: 'Disponible', updatedAt: createdAt },
  { pollId: 'poll-math-fixed', slotId: 'slot-math-tuesday', studentId: 'student-1', vote: 'Indisponible', updatedAt: createdAt },
  { pollId: 'poll-math-fixed', slotId: 'slot-math-sunday', studentId: 'student-2', vote: 'Disponible', updatedAt: createdAt },
  { pollId: 'poll-physics-open', slotId: 'slot-physics-monday', studentId: 'student-4', vote: 'Disponible', updatedAt: createdAt },
  { pollId: 'poll-physics-open', slotId: 'slot-physics-wednesday', studentId: 'student-4', vote: 'Si nécessaire', updatedAt: createdAt },
  { pollId: 'poll-physics-open', slotId: 'slot-physics-saturday', studentId: 'student-5', vote: 'Disponible', updatedAt: createdAt },
]

export const demoLiveSessions: LiveSession[] = [
  { id: 'group-math-session-1', title: 'Bac Mathématiques - Math', description: 'Séance hebdomadaire du groupe.', subjectId: 'math', teacherId: 'teacher-1', groupId: 'group-math-math', date: '2026-09-06', startTime: '17:00', durationMinutes: 90, provider: 'livekit', status: 'ended', resources: [], createdAt },
  { id: 'group-math-session-2', title: 'Bac Mathématiques - Math', description: 'Séance hebdomadaire du groupe.', subjectId: 'math', teacherId: 'teacher-1', groupId: 'group-math-math', date: '2026-09-13', startTime: '17:00', durationMinutes: 90, provider: 'livekit', status: 'ended', resources: [], createdAt },
  { id: 'group-math-session-3', title: 'Bac Mathématiques - Math', description: 'Séance hebdomadaire du groupe.', subjectId: 'math', teacherId: 'teacher-1', groupId: 'group-math-math', date: '2026-11-29', startTime: '17:00', durationMinutes: 90, provider: 'livekit', status: 'scheduled', resources: [], createdAt },
  { id: 'group-math-session-4', title: 'Bac Mathématiques - Math', description: 'Séance hebdomadaire du groupe.', subjectId: 'math', teacherId: 'teacher-1', groupId: 'group-math-math', date: '2026-12-06', startTime: '17:00', durationMinutes: 90, provider: 'livekit', status: 'scheduled', resources: [], createdAt },
]

export const demoGroupAttendance: GroupAttendance[] = [
  { groupId: 'group-math-math', sessionId: 'group-math-session-1', studentId: 'student-1', status: 'présent', markedAt: createdAt },
  { groupId: 'group-math-math', sessionId: 'group-math-session-1', studentId: 'student-2', status: 'retard', markedAt: createdAt },
  { groupId: 'group-math-math', sessionId: 'group-math-session-2', studentId: 'student-1', status: 'absent justifié', markedAt: createdAt },
  { groupId: 'group-math-math', sessionId: 'group-math-session-2', studentId: 'student-2', status: 'présent', markedAt: createdAt },
]

export const demoClassLogEntries: ClassLogEntry[] = [
  { id: 'class-log-1', groupId: 'group-math-math', sessionId: 'group-math-session-1', teacherId: 'teacher-1', coveredLessonIds: ['lesson-1'], summary: 'Limites remarquables et exercices d’application.', createdAt },
  { id: 'class-log-2', groupId: 'group-math-math', sessionId: 'group-math-session-2', teacherId: 'teacher-1', coveredLessonIds: ['lesson-2'], summary: 'Asymptotes et lecture graphique.', createdAt },
]

export const demoGroupAssessments: GroupAssessment[] = [
  { id: 'assessment-math-1', groupId: 'group-math-math', teacherId: 'teacher-1', title: 'Devoir : limites', type: 'devoir', date: '2026-09-13', maxPoints: 20, coefficient: 1, createdAt, published: true },
]

export const demoStudentGrades: StudentGrade[] = [
  { id: 'grade-math-student-1', assessmentId: 'assessment-math-1', studentId: 'student-1', score: 15, absent: false, updatedAt: createdAt },
  { id: 'grade-math-student-2', assessmentId: 'assessment-math-1', studentId: 'student-2', score: 11, absent: false, updatedAt: createdAt },
]

export const demoGroupAnnouncements: GroupAnnouncement[] = [
  { id: 'group-announcement-1', groupId: 'group-math-math', teacherId: 'teacher-1', title: 'Bienvenue dans le groupe', body: 'La prochaine séance portera sur les limites et la continuité.', pinned: true, createdAt },
]

export const demoGroupPayments: GroupPayment[] = []
export const demoGroupRescheduleRequests: GroupRescheduleRequest[] = []
export const demoGradeAuditLog: import('@/types').GradeAuditEntry[] = []

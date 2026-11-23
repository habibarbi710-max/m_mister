export type Role = 'student' | 'teacher' | 'admin'
export type Section = string
export type BacSection = { id: string; name: string; order: number; active: boolean }
export type ContentStatus = 'draft' | 'published'
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string }
export type User = { id: string; name: string; email: string; phone: string; section: Section; sectionId?: string; role: Role; blocked?: boolean; avatarUrl?: string }
export type AuthCredential = { user: User; passwordHash: string }
export type Question = { id: string; prompt: string; choices: string[]; answer: number; explanation: string }
export type Quiz = { id: string; title: string; questions: Question[] }
export type OwnedContent = { ownerId: string; status: ContentStatus; order: number; createdAt: string; updatedAt: string }
export type Exercise = OwnedContent & { id: string; prompt: string; correction: string }
export type LessonVideoProvider = 'bunny' | 'vimeo' | 'youtube' | 'mp4'
export type LessonVideo = {
  id: string
  title: string
  provider: LessonVideoProvider
  url: string
  durationSeconds: number
  order: number
}
export type LessonVideoPosition = { videoId: string; seconds: number; updatedAt: string }
export type VideoPositionKey = `videoPosition:${string}:${string}`
export type Lesson = OwnedContent & {
  id: string
  title: string
  duration: number
  videoUrl: string
  videos: LessonVideo[]
  summary: string
  pdfUrl: string
  exercises: Exercise[]
  quiz: OwnedContent & Quiz
  isFree: boolean
  teacherId: string
  subjectId?: string
  chapterId?: string
  views: number
}
export type Module = OwnedContent & { id: string; title: string; description: string; lessons: Lesson[] }
export type Chapter = Module
export type Subject = {
  id: string
  order: number
  title: string
  titleFr: string
  description: string
  color: string
  icon: string
  sections: Section[]
  status: ContentStatus
  ownerIds: string[]
  createdAt: string
  updatedAt: string
  chapters: Module[]
}
export type Exam = OwnedContent & {
  id: string
  subjectId: string
  year: number
  session: string
  statement: string
  correction: string
  teacherId?: string
}
export type ExerciseInput = Pick<Exercise, 'prompt' | 'correction'> & Partial<Omit<Exercise, 'prompt' | 'correction'>>
export type QuizInput = Omit<Quiz, 'id' | 'questions'> & { id?: string; questions: Question[] } & Partial<OwnedContent>
export type LessonInput = Omit<Lesson, 'id' | 'views' | 'ownerId' | 'teacherId' | 'createdAt' | 'updatedAt' | 'exercises' | 'quiz'> & {
  id?: string
  ownerId?: string
  teacherId?: string
  createdAt?: string
  updatedAt?: string
  exercises: ExerciseInput[]
  quiz: QuizInput
}
export type LessonDraft = { lessonId: string; ownerId: string; data: LessonInput; updatedAt: string }
export type ModuleInput = Omit<Module, 'id' | 'ownerId' | 'createdAt' | 'updatedAt' | 'lessons'> & {
  id?: string
  ownerId?: string
  createdAt?: string
  updatedAt?: string
  lessons?: Lesson[]
}
export type SubjectInput = Omit<Subject, 'id' | 'title' | 'order' | 'ownerIds' | 'createdAt' | 'updatedAt' | 'chapters'> & {
  id?: string
  order?: number
  ownerIds?: string[]
  createdAt?: string
  updatedAt?: string
  chapters?: Module[]
}
export type ExamInput = Omit<Exam, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'> & {
  id?: string
  ownerId?: string
  createdAt?: string
  updatedAt?: string
}
export type ReorderModuleInput = { moduleId: string; order: number }
export type ReorderSubjectInput = { subjectId: string; order: number }
export type ContentTrashItem =
  | { id: string; kind: 'subject'; deletedAt: string; subject: Subject }
  | { id: string; kind: 'module'; deletedAt: string; subjectId: string; module: Module }
  | { id: string; kind: 'lesson'; deletedAt: string; subjectId: string; moduleId: string; lesson: Lesson }
export type LiveSessionStatus = 'scheduled' | 'live' | 'ended' | 'cancelled'
export type LiveResource = { title: string; url: string }
export type LiveSession = {
  id: string
  title: string
  description: string
  subjectId: string
  teacherId: string
  date: string
  startTime: string
  durationMinutes: number
  provider: 'livekit' | 'external'
  externalUrl?: string
  status: LiveSessionStatus
  replayUrl?: string
  changeReason?: string
  resources: LiveResource[]
  createdAt: string
  groupId?: string
}
export type LiveSessionInput = Omit<LiveSession, 'id' | 'teacherId' | 'status' | 'createdAt'>
export type LiveSessionChanges = Partial<Omit<LiveSession, 'id' | 'teacherId' | 'createdAt'>>
export type LiveQuestion = {
  id: string
  sessionId: string
  studentId: string
  text: string
  createdAt: string
  voterIds: string[]
  answered: boolean
}
export type LiveAttendance = { sessionId: string; studentId: string; joinedAt: string }
export type SubscriptionScope = 'platform' | 'teacher' | 'subject'
export type PricingScope = 'group' | 'teacher' | 'platform'
export type Subscription = { status: 'None' | 'Pending' | 'Active' | 'Expired'; plan?: string; expiresAt?: string; scope?: SubscriptionScope }
export type TeacherProfile = {
  teacherId: string
  photoUrl: string
  bio: string
  specialties: string[]
  subjectIds: string[]
  updatedAt: string
}
export type TeacherFollow = { teacherId: string; studentId: string; followedAt: string; lastVisitedAt: string }
export type StudentSubjectEnrollment = { studentId: string; subjectId: string; enrolledAt: string }
export type ClassGroupStatus = 'ouvert aux inscriptions' | 'complet' | 'fermé'
export type GroupScheduleStatus = 'en attente' | 'proposé' | 'fixé'
export type GroupEnrollmentStatus = 'en attente' | 'accepté' | 'refusé' | 'retiré'
export type ClassGroup = {
  id: string
  name: string
  sectionId: string
  subjectId: string
  teacherId: string
  maxStudents: number
  description: string
  monthlyPrice: number | null
  status: ClassGroupStatus
  scheduleStatus: GroupScheduleStatus
  createdAt: string
}
export type GroupEnrollment = {
  id: string
  studentId: string
  groupId: string
  status: GroupEnrollmentStatus
  requestedAt: string
  decidedAt?: string
  decisionReason?: string
  leftAt?: string
}
export type GroupContentLink = {
  id: string
  groupId: string
  moduleId: string
  lessonIds: string[]
  order: number
  published: boolean
}
export type WeeklySlot = {
  id: string
  dayOfWeek: number
  startTime: string
  durationMinutes: number
}
export type AvailabilityVote = 'Disponible' | 'Si nécessaire' | 'Indisponible'
export type SchedulePoll = {
  id: string
  groupId: string
  teacherId: string
  slots: WeeklySlot[]
  deadlineAt: string
  status: 'ouvert' | 'fixé' | 'expiré'
  selectedSlotIds: string[]
  weeks: number
  createdAt: string
}
export type SchedulePollVote = { pollId: string; slotId: string; studentId: string; vote: AvailabilityVote; updatedAt: string }
export type GroupRescheduleRequest = {
  id: string
  groupId: string
  sessionId?: string
  requesterId: string
  proposedDate?: string
  proposedStartTime?: string
  reason: string
  status: 'en attente' | 'accepté' | 'refusé'
  createdAt: string
}
export type AttendanceStatus = 'présent' | 'absent' | 'retard' | 'absent justifié'
export type GroupAttendance = { groupId: string; sessionId: string; studentId: string; status: AttendanceStatus; markedAt: string }
export type ClassLogEntry = {
  id: string
  groupId: string
  sessionId: string
  teacherId: string
  coveredLessonIds: string[]
  summary: string
  createdAt: string
}
export type GroupAssessmentType = 'devoir' | 'oral' | 'TP' | 'quiz'
export type GroupAssessment = {
  id: string
  groupId: string
  teacherId: string
  title: string
  type: GroupAssessmentType
  date: string
  maxPoints: number
  coefficient: number
  createdAt: string
  published: boolean
}
export type StudentGrade = {
  id: string
  assessmentId: string
  studentId: string
  score?: number
  absent: boolean
  updatedAt: string
}
export type GradeAuditEntry = {
  id: string
  gradeId: string
  teacherId: string
  previousScore?: number
  nextScore?: number
  reason: string
  createdAt: string
}
export type GroupPayment = {
  id: string
  groupId: string
  studentId: string
  period: string
  status: 'payé' | 'en attente' | 'en retard'
  receipt?: string
  submittedAt: string
  decidedAt?: string
}
export type GroupAnnouncement = {
  id: string
  groupId: string
  teacherId: string
  title: string
  body: string
  pinned: boolean
  createdAt: string
  hidden?: boolean
}
export type LessonRating = {
  id: string
  lessonId: string
  teacherId: string
  studentId: string
  stars: number
  comment: string
  createdAt: string
  updatedAt: string
  hidden?: boolean
}
export type LessonAnswer = {
  id: string
  authorId: string
  text: string
  createdAt: string
  teacherAnswer: boolean
  hidden?: boolean
}
export type LessonQuestion = {
  id: string
  lessonId: string
  teacherId: string
  authorId: string
  text: string
  videoPositionSeconds?: number
  createdAt: string
  answers: LessonAnswer[]
  voterIds: string[]
  answered: boolean
  pinnedAnswerId?: string
  hidden?: boolean
}
export type HomeworkFile = { name: string; type: 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf'; data: string }
export type HomeworkAssignment = {
  id: string
  teacherId: string
  groupId?: string
  lessonId?: string
  moduleId?: string
  title: string
  instructions: string
  dueAt: string
  maxPoints: number
  allowedTypes: Array<'text' | 'image' | 'pdf'>
  createdAt: string
}
export type HomeworkSubmission = {
  id: string
  assignmentId: string
  studentId: string
  text?: string
  file?: HomeworkFile
  submittedAt: string
  late: boolean
  grade?: number
  feedback?: string
  correctedFile?: HomeworkFile
  correctedAt?: string
}
export type TeacherAnnouncement = {
  id: string
  teacherId: string
  title: string
  body: string
  audience: { type: 'followers' } | { type: 'subject'; subjectId: string }
  pinned: boolean
  createdAt: string
}
export type PrivateMessage = {
  id: string
  conversationId: string
  senderId: string
  recipientId: string
  text: string
  createdAt: string
  readAt?: string
  flagged: boolean
  hidden?: boolean
}
export type MessagingBlock = { studentId: string; teacherId: string; createdAt: string }
export type Report = {
  id: string
  reporterId: string
  targetType: 'comment' | 'question' | 'review' | 'message' | 'answer' | 'announcement'
  targetId: string
  reason: string
  createdAt: string
  status: 'pending' | 'resolved'
}
export type ModerationAction = {
  id: string
  reportId: string
  adminId: string
  action: 'hide' | 'delete' | 'warn' | 'block-messaging' | 'suspend'
  note: string
  createdAt: string
}
export type RelationshipSettings = {
  messagingEnabled: boolean
  messagesPerHour: number
  bannedWords: string[]
  disabledMessagingUserIds: string[]
}
export type TeacherEngagement = {
  teacherId: string
  month: string
  videoMinutesWatched: number
  lessonsCompleted: number
  activeStudents: number
  revenueSharePercentage: number
}
export type StudentActivity = {
  studentId: string
  teacherId: string
  lessonId: string
  type: 'video' | 'lesson-completed' | 'quiz'
  occurredAt: string
}
export type Payment = { id: string; userId: string; userName: string; phone: string; plan: string; amount: number; submittedAt: string; status: 'Pending' | 'Approved' | 'Rejected'; receipt: string; receiptType: string; rejectionReason?: string }
export type QuizResult = { id: string; lessonId: string; title: string; score: number; date: string; answers: number[] }
export type ReorderLessonInput = { lessonId: string; order: number }
export type TeacherAssignment = { teacherId: string; subjectIds: string[] }
export type PlatformSettings = {
  monthlyPrice: number
  paymentInstructions: string
  canCreateSubjects: boolean
  subscriptionScope?: SubscriptionScope
  paymentsEnabled?: boolean
  pricingScope?: PricingScope
  gracePeriodDays?: number
}

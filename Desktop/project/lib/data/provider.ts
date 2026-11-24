import type {
  AuthCredential,
  ContentTrashItem,
  BacSection,
  ClassGroup,
  GroupEnrollment,
  GroupContentLink,
  SchedulePoll,
  SchedulePollVote,
  GroupRescheduleRequest,
  GroupAttendance,
  ClassLogEntry,
  GroupAssessment,
  StudentGrade,
  GradeAuditEntry,
  GroupPayment,
  GroupAnnouncement,
  GroupMaterial,
  Exam,
  Lesson,
  LessonDraft,
  LessonQuestion,
  LessonRating,
  LessonVideoPosition,
  LiveAttendance,
  LiveQuestion,
  LiveSession,
  HomeworkAssignment,
  HomeworkSubmission,
  MessagingBlock,
  ModerationAction,
  Payment,
  PlatformSettings,
  PrivateMessage,
  QuizResult,
  RelationshipSettings,
  Report,
  Subject,
  StudentSubjectEnrollment,
  StudentActivity,
  Subscription,
  TeacherAnnouncement,
  TeacherEngagement,
  TeacherFollow,
  TeacherProfile,
  User,
} from '@/types'

export type LanguagePreference = 'fr'

export type Notification = {
  id: string
  userId: string
  type: 'payment-approved' | 'payment-rejected' | 'live-starting' | 'new-lesson'
    | 'question-reply' | 'announcement' | 'homework-graded' | 'message-received'
    | 'enrollment-request' | 'enrollment-accepted' | 'enrollment-refused'
    | 'slots-proposed' | 'schedule-fixed' | 'session-rescheduled' | 'session-cancelled'
    | 'grade-published' | 'group-payment'
  title: string
  message: string
  href: string
  createdAt: string
  readAt?: string
}

export type DataTables = {
  accounts: AuthCredential[]
  lang: LanguagePreference
  subjects: Subject[]
  lessons: Lesson[]
  lessonDrafts: LessonDraft[]
  deletedLessons: string[]
  exams: Exam[]
  liveSessions: LiveSession[]
  liveQuestions: LiveQuestion[]
  liveAttendance: LiveAttendance[]
  users: User[]
  user: User | null
  quizMetrics: Array<{ lessonId: string; score: number }>
  payments: Payment[]
  lessonViews: Record<string, number>
  teacherAssignments: Record<string, string[]>
  settings: PlatformSettings
  contentTrash: ContentTrashItem[]
  notifications: Notification[]
  teacherProfiles: TeacherProfile[]
  teacherFollows: TeacherFollow[]
  lessonRatings: LessonRating[]
  lessonQuestions: LessonQuestion[]
  homeworkAssignments: HomeworkAssignment[]
  homeworkSubmissions: HomeworkSubmission[]
  teacherAnnouncements: TeacherAnnouncement[]
  privateMessages: PrivateMessage[]
  messagingBlocks: MessagingBlock[]
  reports: Report[]
  moderationActions: ModerationAction[]
  relationshipSettings: RelationshipSettings
  teacherEngagement: TeacherEngagement[]
  studentActivity: StudentActivity[]
  subjectEnrollments: StudentSubjectEnrollment[]
  sections: BacSection[]
  classGroups: ClassGroup[]
  groupEnrollments: GroupEnrollment[]
  groupContentLinks: GroupContentLink[]
  schedulePolls: SchedulePoll[]
  schedulePollVotes: SchedulePollVote[]
  groupRescheduleRequests: GroupRescheduleRequest[]
  groupAttendance: GroupAttendance[]
  classLogEntries: ClassLogEntry[]
  groupAssessments: GroupAssessment[]
  studentGrades: StudentGrade[]
  gradeAuditLog: GradeAuditEntry[]
  groupPayments: GroupPayment[]
  groupAnnouncements: GroupAnnouncement[]
  groupMaterials: GroupMaterial[]
  theme: 'light' | 'dark'
}

export type DataKey = keyof DataTables
  | `completed:${string}`
  | `lastViewed:${string}`
  | `quizResults:${string}`
  | `subscription:${string}`
  | `videoPosition:${string}:${string}`
export type DataValue<K extends DataKey> =
  K extends keyof DataTables ? DataTables[K]
    : K extends `completed:${string}` ? string[]
      : K extends `lastViewed:${string}` ? string | null
        : K extends `quizResults:${string}` ? QuizResult[]
          : K extends `subscription:${string}` ? Subscription
            : K extends `videoPosition:${string}:${string}` ? LessonVideoPosition | null
              : never
export type DataErrorCode = 'storage-unavailable' | 'invalid-data' | 'persistence-failed' | 'reset-failed'
export type DataResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: DataErrorCode; message: string } }

export interface DataProvider {
  read<K extends DataKey>(key: K): Promise<DataResult<DataValue<K>>>
  write<K extends DataKey>(key: K, value: DataValue<K>): Promise<DataResult<void>>
  readAttachment(id: string): Promise<DataResult<Blob | undefined>>
  writeAttachment(id: string, value: Blob): Promise<DataResult<void>>
  deleteAttachment(id: string): Promise<DataResult<void>>
  clearAttachments(): Promise<DataResult<void>>
  reset(): Promise<DataResult<void>>
}

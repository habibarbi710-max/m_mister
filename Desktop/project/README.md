# Learn With Me

Plateforme e-learning en français pour les élèves tunisiens du Baccalauréat.

## Run locally

```powershell
npm install
npm run dev
```

Open http://localhost:3000.

## Quality checks

```powershell
npm run typecheck
npm run lint
npm run build
```

## Demo accounts

Passwords are hashed locally with PBKDF2-SHA256 and stored in `edubac:accounts`.

| Role | Email | Password |
|---|---|---|
| Student | student@edubac.tn | Student123! |
| Teacher | teacher@edubac.tn | Teacher123! |
| Admin | admin@edubac.tn | Admin123! |

## Architecture

```text
app/                    App Router pages, loading and error states
components/
  layout/               Application shell components
  student/              Student feature components
  teacher/              Teacher feature components
  admin/                Admin feature components
  shared/               Providers and shared components
  ui/                   Base UI components
lib/
  api.ts                Sole data access layer for UI components
  auth.ts               Demo authentication and password handling
  mock-data.ts          Seed content
types/                  Shared domain types
```

The UI reads/writes data only through `lib/api.ts`. Authentication is temporary and uses browser `localStorage`.

## Data functions to replace for a real database

`lib/api.ts` is the only module that reads or writes browser storage. Replace these exported implementations, preserving their signatures and result shapes:

- Content: `getSubjects`, `getSubject`, `getLesson`, `getExams`, `getLiveSessions`
- Session/profile: `getCurrentUser`, `signIn`, `registerUser`, `signOut`, `updateProfile`
- Credentials/preferences: `getAuthCredentials`, `saveAuthCredentials`, `saveLanguagePreference`
- Progress: `getCompletedLessons`, `getLastViewedLesson`, `completeLesson`, `getQuizResults`, `submitQuizResult`, `getLessonPerformance`, `incrementLessonViews`
- Subscriptions/payments: `createPaymentRequest`, `getPayments`, `getMyPayments`, `approvePayment`, `getSubscription`
- Student/teacher administration: `getUsers`, `blockUser`, `createTeacherAccount`, `assignTeacherSubjects`, `getTeacherAssignments`, `getAdminMetrics`
- Teacher content: `getTeacherLessons`, `saveLesson`, `deleteLesson`, `reorderLessons`, `getTeacherExams`, `saveExam`, `deleteExam`
- Live sessions/settings: `createLiveSession`, `updateLiveSession`, `cancelLiveSession`, `getSettings`, `saveSettings`

`lib/auth.ts` currently hashes passwords with PBKDF2 and verifies them against these local credentials. Replace it with server-side sessions and password verification when adding the backend. The current route guard is client-side only; add server-side authorization and user-scoped database policies before deploying.

## Current limitations

This is intentionally frontend-only: there is no database, real payment gateway, real video hosting, or server-side authorization. Payments, subscriptions, progress, and teacher-created content are stored in browser `localStorage`; payment receipts and uploaded PDFs are stored as data URLs. The built-in lessons are sample text and have no videos or PDFs. Exams and live sessions start empty and must be added by teachers. Do not use the client-side role checks as a security boundary.

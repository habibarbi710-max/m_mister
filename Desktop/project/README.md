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
npm test
npm run build
```

## Demo accounts

Passwords are hashed locally with PBKDF2-SHA256 and stored in `edubac:accounts`.

| Role | Email | Password |
|---|---|---|
| Student | student@edubac.tn | Student123! |
| Teacher | teacher@edubac.tn | Teacher123! |
| Admin | admin@edubac.tn | Admin123! |

The seed also includes `teacher2@edubac.tn`, `teacher3@edubac.tn`, and twelve student accounts (`student@edubac.tn`, `student2@edubac.tn` … `student12@edubac.tn`). Teacher accounts use `Teacher123!`; student accounts use `Student123!`.

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
  api.ts                Business rules and UI-facing data operations
  data/
    provider.ts         Typed data-provider contract
    local-provider.ts   localStorage-backed prototype provider
    config.ts           Single active-provider selection
  auth.ts               Demo authentication and password handling
  mock-data.ts          Seed content
types/                  Shared domain types
```

Components call `lib/api.ts`; it enforces ownership, access and subscription rules before using the configured data provider. `lib/data/local-provider.ts` is the only module that directly reads/writes browser `localStorage`. Authentication is temporary and browser-local.

To connect Supabase, implement the `DataProvider` contract in `lib/data/supabase-provider.ts`, then select it in `lib/data/config.ts`. Keep business rules in `lib/api.ts`; do not add storage access to components. The current provider uses typed table keys and async results, while some UI-facing API operations still use legacy raw-value/throwing contracts and should be standardized as part of backend integration.

## Teacher-led classes

The learning model is **filière → classe de professeur → inscription de l’élève → contenus et séances**. Seeded sections are Mathématiques, Sciences expérimentales, Technique, Économie et gestion, Informatique, Lettres and Sport. Administrators can add, rename or disable sections; teachers create groups for subjects they own or teach. A student chooses a section at registration and may request one class per subject. Leaving a class records a withdrawn enrollment rather than deleting history.

The main flows are:

- Students browse `/groups`, filter by section and subject, request enrollment, then use `/student/groups`, `/student/schedule`, `/student/homework` and `/student/record`.
- A teacher manages owned groups at `/teacher/groups`, reviews requests, links owned curriculum modules/lessons, proposes weekly slots, records attendance and publishes announcements, homework and grades.
- Administrators manage sections, group status, enrollments, moves and class KPIs at `/admin/groups`. Existing payment approval and moderation tools remain available.

| Data/action | Student | Teacher | Administrator |
|---|---|---|---|
| Browse an open class and free preview | Yes | Yes | Yes |
| Read linked private lesson, homework, grades or announcements | Accepted enrollment only (plus payment when enabled) | Own class only | All |
| Read student roster | Own record only | First name + last initial, in own classes | Administrative tools |
| Read student contacts or payments | No | No | Existing admin payment tools only |
| Create/edit group content and schedules | No | Own groups and owned content | All groups |

Group records, enrollments, content links, slot polls/votes, live sessions, attendance, class logs, assessments, grades/audit entries, announcements, payments and settings use the `edubac:v3:*` storage namespace. Curriculum data continues to use `edubac:v2:*`; migration reads legacy keys, normalizes known older values and leaves their originals intact. The local provider seeds seven sections, four groups, twelve students, mixed enrollment states, a voted and a fixed schedule, past/upcoming live sessions, attendance, a grade and an announcement. Demo data can be reset by an administrator in development.

**Payments are optional and off by default.** With `paymentsEnabled: false`, classes are free, prices are hidden in student/teacher-facing API results and private content is gated only by accepted enrollment. When enabled, group billing requires a paid monthly period; the previous month remains valid during the configured grace period. `pricingScope` is currently restricted to `group`; `subscriptionScope` is restricted to `platform`. Other scopes are reserved for later and are rejected rather than simulated.

All UI data operations go through `lib/api.ts`, which applies role, ownership, enrollment and billing checks before using the `DataProvider`. For a real database, implement the group-related `DataTables` in `lib/data/provider.ts` in the selected backend provider and keep these rules in `lib/api.ts`. Replace browser-local auth with verified server sessions and enforce the same permissions in database policies; localStorage role checks are not a security boundary. Payments remain manual and should be connected to a server-side payment provider only after pricing is decided.

## Curriculum ownership and videos

The curriculum hierarchy is **Subject → Module → Lesson → videos, exercises, quiz and PDF**. Teachers can create subjects when the platform setting permits it. A subject may have multiple teacher owners; its owners can update its details. Any teacher can contribute modules and lessons, and may edit, duplicate, reorder or delete only the content they own. A teacher cannot delete a subject or module that contains another teacher’s contributions. Administrators can edit all content, change owners, and unpublish any item. All ownership checks are in `lib/api.ts`.

Student catalog calls return published subjects, modules and lessons in their configured order, further filtered by free-preview status or accepted enrollment in a class that publishes the lesson. If group payments are enabled, a valid paid period is also required. Drafts remain private to their owner and administrators. Deletes are soft-deletes retained in the teacher studio trash for 30 days.

Existing browser data migrates from the legacy keys to versioned `edubac:v2:*` curriculum keys without deleting the old values. Legacy modules infer ownership from their first lesson when ownership metadata is absent; the built-in sample curriculum belongs to the seed teacher.

Lesson videos are links only. YouTube, Vimeo, Bunny Stream and direct HTTPS MP4 URLs are parsed and embedded by `lib/video/parse.ts`; `lib/video/storage.ts` implements the `VideoStorage` link mode. The URL format is validated locally, but provider reachability, privacy and playback permissions cannot be verified without provider APIs. Real video-file upload requires an external storage implementation. Student MP4 playback position, speed and 90% completion are persisted locally; embedded-provider playback telemetry is not available. PDFs are stored as validated data URLs (maximum 3 MB), which is prototype-only and should move to object storage.

`npm test` runs Vitest coverage for local data validation and migration, class enrollment/content access, optional group payments and grace periods, teacher roster privacy/scope, scheduling and session generation, attendance, homework correction, group grade calculations, subscription/payment behavior, teacher ownership, publication visibility, moderation, video URL parsing, blocked accounts and quiz scoring. Playwright is not installed, so browser-level checks are manual. Separate browser profiles cannot share localStorage data.

In development, administrators can use **Réinitialiser les données de démonstration** to restore the current browser's demo data. The action is hidden outside development and requires an administrator session.

## Live

The live experience uses LiveKit for integrated audio/video rooms. Session metadata, questions, votes, and attendance are currently stored in browser `localStorage` through `lib/data/local-provider.ts`, called by business-rule operations in `lib/api.ts`. External Meet/Zoom sessions open from the same in-platform room page and retain the questions/resources panel.

The LiveKit packages are `livekit-client`, `@livekit/components-react`, `@livekit/components-styles`, and `livekit-server-sdk`. Copy `.env.example` to `.env.local` and set:

```text
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-server-api-key
LIVEKIT_API_SECRET=your-server-api-secret
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
```

Create a free project in [LiveKit Cloud](https://cloud.livekit.io/), then copy the project URL and server API credentials from its project settings. Keep `LIVEKIT_API_SECRET` server-only: never prefix it with `NEXT_PUBLIC_` or expose it to browser code. `LIVEKIT_URL` is used by server-side room administration; `NEXT_PUBLIC_LIVEKIT_URL` is the secure WebSocket URL sent to the room client.

Start the app with `npm run dev` and configure LiveKit before trying to join a room. A true two-browser teacher/student test is **not possible with the current localStorage-only data layer**: each browser profile has separate users, sessions, and subscriptions, so a teacher-created session is not visible to the student profile. The UI can be exercised with a teacher demo account, but real two-participant media, questions, hand raise, and speaking-permission flows must wait until both clients use shared server-side session and database data. After that connection, use two separate browser profiles (teacher in one, subscribed student in the other), create/start a LiveKit session as the teacher, and test the room controls and interaction panel from each browser.

**Prototype security limitation:** the current account and subscription live in browser `localStorage`, so a route handler cannot securely verify identity, ownership, or subscription. `verifyLiveAccess` deliberately refuses token issuance in production rather than trusting those client claims. The permission route also refuses production requests. Before public launch, replace the checks in `lib/livekit-access.ts` and both `app/api/live/*/route.ts` handlers with verified server sessions and database-backed user, ownership, and subscription lookups. Do not treat the current client-side checks as authorization.

The initial capacity limit is `MAX_STUDENTS_PER_SESSION = 30` in `lib/livekit-config.ts`. The teacher session form shows the estimated participant-minutes at this limit; token issuance rejects extra students.

## Connecting a real database

Implement `DataProvider` in **`lib/data/supabase-provider.ts`**, then change the active provider in **`lib/data/config.ts`**. The provider handles these typed records through asynchronous `read`, `write`, and `reset` operations:

- Accounts, current user, users, sections, class groups, enrollments and language/theme preferences
- Subjects (with modules and embedded lesson/exercise/quiz metadata), lessons, lesson drafts, deleted lesson IDs, content trash, exams, and settings
- Quiz metrics and per-user quiz results, lesson completion, and last-viewed lesson
- Per-user, per-video playback positions
- Platform and per-group payments/subscriptions
- Group content links, schedule polls/votes, reschedule requests, attendance, class logs, assessments, grades and audit entries
- Live sessions, questions, and attendance
- Lesson view counts, teacher subject assignments, and notifications

Keep permissions, subscription gates, and ownership checks in `lib/api.ts`; UI components should continue calling that API and must not access the provider or storage directly. If database-specific queries require changes to `lib/api.ts`, preserve these business rules and cover the changed operations with tests. API methods still have a mix of raw-value and `ApiResult` contracts; standardize those before treating the adapter as production-ready.

`lib/auth.ts` currently hashes passwords with PBKDF2 and verifies them against these local credentials. Replace it with server-side sessions and password verification when adding the backend. The current route guard is client-side only; add server-side authorization and user-scoped database policies before deploying.

## Current limitations

This is intentionally frontend-only: there is no database, real payment gateway, hosted lesson-video service, or server-side authorization. Group data, payments, subscriptions, progress and teacher-created content are stored in browser `localStorage`; payment receipts and uploaded PDFs are stored as data URLs. The built-in lessons are sample text and have no videos or PDFs. LiveKit requires a configured project and is disabled for production token issuance until server authentication is connected. Do not use the client-side role checks as a security boundary.

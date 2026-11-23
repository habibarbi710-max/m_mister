# Prototype audit

Audit initiated before the current implementation phase. The original baseline and the latest verified checks are recorded below.

| Command | Result |
|---|---|
| `npm run build` | Passed; Next.js generated all routes. |
| `npm run lint` | Passed. |
| `npm run typecheck` | Passed. |
| Automated feature tests | No test script or matching project test files found. |

Latest checks after the provider, header tools, mobile refinements, and business-rule tests were added:

| Command | Result |
|---|---|
| `npm run build` | Passed after header tools and development reset wiring. |
| `npm run lint` | Passed after header tools and development reset wiring. |
| `npm run typecheck` | Passed after header tools and development reset wiring. |
| `npm test` | Passed: 14 Vitest tests at that checkpoint. |
| Responsive browser checks | No horizontal overflow at 375, 768, and 1280px on the routes tested at that checkpoint. |
| Manual student/payment smoke | Register → free lesson → paid lesson blocked → receipt upload → admin approval → paid lesson unlocked → quiz result saved → progress updated; passed. |
| Role guards | Student visiting `/teacher` returns to `/dashboard`; teacher visiting `/admin` returns to `/teacher`; passed. |

The worktree already contains uncommitted LiveKit and UI changes from the preceding task. This audit describes that current state; unrelated or pre-existing changes must not be discarded.

## Blocker

| Finding | Files | Status |
|---|---|---|
| A localStorage session is not an authorization boundary. Browser users can alter their role, user record, account list, subscriptions, receipts, and content. `getCurrentUser()` trusts local browser data and client-side guards only redirect in the UI. | `lib/api.ts`, `lib/auth.ts`, `components/layout/app-shell.tsx`, `components/shared/auth-provider.tsx` | Open by design for a prototype; never deploy as production authorization. |
| LiveKit server handlers receive role, identity, subscription and session claims from the browser. Token and participant-permission operations fail closed in production, so production live rooms cannot currently issue tokens; local browser profiles also do not share created sessions, questions or subscriptions. | `lib/livekit-access.ts`, `app/api/live/token/route.ts`, `app/api/live/permissions/route.ts`, `app/api/live/end/route.ts`, `README.md` | Open until verified server auth/shared persistence and LiveKit credentials are configured. |
| Supabase replacement is only partly isolated: a typed async `DataProvider`, localStorage provider, and single provider-selection file now exist, and runtime shape validation guards stored values. `lib/api.ts` still mixes business rules, validation, migrations and metrics, while some public operations use raw values or thrown errors instead of a uniform result. | `lib/api.ts`, `lib/auth.ts`, `lib/data/provider.ts`, `lib/data/local-provider.ts`, `lib/data/config.ts` | Partial; local persistence is isolated and swappable, but API contracts need standardization. |

## Major

| Finding | Files | Status |
|---|---|---|
| API operations have inconsistent contracts: some return `ApiResult`, some throw, some return empty arrays/null-like values for unauthorized users, and others return raw values. This makes backend substitution and reliable error handling difficult. | `types/index.ts`, `lib/api.ts`, `lib/auth.ts` | Open. |
| Live sessions, attendance, questions, votes and payment approval are local to one browser profile. Therefore real student/teacher collaboration, admin review across profiles and the requested two-browser smoke flow cannot work with localStorage alone. | `lib/api.ts`, `components/student/live-room-page.tsx`, `components/student/live-room-panels.tsx`, `components/teacher/teacher-live-sessions.tsx`, `README.md` | Partial prototype; shared multi-user behavior open. |
| Live attendance is recorded only after a student connects to LiveKit; external join records it from the click handler. With no cross-profile session/subscription state, neither represents a complete verified end-to-end student attendance flow. | `components/student/live-room-client.tsx`, `components/student/live-room-page.tsx`, `lib/api.ts` | Partial. |
| Passwords are hashed with PBKDF2, but hashing and verification run in client code and hashes are persisted in localStorage. They are not suitable as production credential storage. | `lib/auth.ts`, `lib/api.ts` | Prototype only; server-side auth open. |
| Automated core tests now cover locked lessons/live links, subscription expiry and 1/3/10-month approval, rejection, teacher ownership, payment visibility, blocked-account login and quiz scoring. There is no Playwright/browser smoke suite; Playwright was not installed. | `package.json`, `tests/api.test.ts`, `lib/quiz-score.ts` | Partial; unit coverage exists, browser flow and broader regression coverage remain open. |
| A number of data views show a toast on failed loads but do not render a persistent error state or retry control. Catalogs and management views often treat initial empty arrays as loaded empty results; some effects do not catch failures. | `components/student/student-catalog.tsx`, `components/student/student-dashboard.tsx`, `components/student/student-account.tsx`, `components/teacher/teacher-dashboard.tsx`, `components/admin/admin-dashboard.tsx` | Open/partial. |
| Large shared files remain: `lib/api.ts` is about 1,443 lines and `app/globals.css` is over 4,000 lines. The teacher content studio and lesson editor have been split into focused components of 250 lines or fewer, and the old `edubac-app.tsx` and `app-pages.tsx` monoliths are absent. | `lib/api.ts`, `app/globals.css`, `components/teacher/content-studio.tsx`, `components/teacher/content-studio-lesson-editor.tsx` | Partial; continue reducing API and stylesheet size in a separate refactor. |
| Admin/teacher tables use a scrollable table wrapper instead of a true card layout on small screens; payment rows contain contact data and receipts as expected for admins but are dense on mobile. | `components/admin/admin-dashboard.tsx`, `app/globals.css` | Partial; tested admin/teacher routes fit the three target widths, but not every dialog/table interaction has been manually reviewed. |
| Modal lesson editor lacks dialog semantics, focus management and Escape handling. Error messages are generally rendered without `aria-describedby`/field error association. Tab controls in the live room have roles, but no keyboard arrow-key behavior. | `components/teacher/teacher-dashboard.tsx`, `components/student/live-room-panels.tsx`, form components | Open. |
| Live-room limits, access and provider operations are partly implemented in route handlers and partly in `lib/api.ts`. Those server handlers are intentionally outside the local data API because they call LiveKit directly, but they currently cannot verify the local identity and must not be represented as secured. | `app/api/live/*/route.ts`, `lib/livekit-access.ts`, `lib/api.ts` | Open for production. |

## Minor

| Finding | Files | Status |
|---|---|---|
| Dark-mode toggle, notification bell, global lesson search, “Reprendre” shortcut, and development-only administrator demo reset are now wired into the shell and admin view. | `components/layout/app-shell.tsx`, `components/layout/header-tools.tsx`, `components/admin/admin-dashboard.tsx`, `lib/api.ts` | Partial; dark toggle, search focus, notification count, mobile menu, and development reset were manually exercised. |
| `lib/mock-data.ts` is actively used as seed content, not dead code. Seed lessons are sample text with no video/PDF. A development-only reset now restores demo defaults. | `lib/mock-data.ts`, `lib/api.ts`, `components/admin/admin-dashboard.tsx`, `README.md` | Partial; reset added, seed lesson media remains intentionally absent. |
| `components/ui/button.tsx` and `lib/utils.ts` are present but the app predominantly uses global CSS button classes; verify actual use before removing them. | `components/ui/button.tsx`, `lib/utils.ts` | Cleanup candidate, not confirmed dead. |
| `@base-ui/react`, `class-variance-authority`, `clsx`, and `tailwind-merge` are used only by the standalone UI button/util helper path; dependency removal is safe only after confirming the path is unused. | `package.json`, `components/ui/button.tsx`, `lib/utils.ts` | Review. |
| Static landing/content copy and several empty-state messages are hardcoded directly in components rather than centralized; they are French but harder to keep consistent. | `components/layout/landing-page.tsx`, `components/student/*`, `components/teacher/*` | Minor maintainability issue. |
| Payment approval/rejection, a live starting, and publication of a new lesson now create user-scoped notifications displayed in the header bell. Persistence remains per-browser. | `lib/api.ts`, `components/layout/header-tools.tsx`, `components/layout/app-shell.tsx` | Partial; implemented locally, no shared delivery across browser profiles. |

## Feature matrix

| Feature | Student | Teacher | Admin | Works? | Notes |
|---|---|---|---|---|---|
| Registration / sign-in / sign-out | Register and sign in with email or phone; sign out | Sign in | Sign in | Partial | Password hashes exist, but identity and roles are client-controlled localStorage; blocked users are rejected by login/session lookup. |
| Profile and password | Edit profile and change password | No profile route | No profile route | Partial | Current password is checked and new hash saved locally; no server security. |
| Browse subjects / lessons | Published lessons; free lesson access; paid lesson hidden/blocked without active subscription | Own lessons and assigned subject data | All lesson management | Partial | Access rules are enforced in `lib/api.ts` and tested; persistence/auth remain browser-local, and API error contracts are inconsistent. |
| Lesson completion / progress | Completion, last-viewed shortcut, subject percentage | Lesson views and quiz aggregates | Aggregate content metrics | Partial | Stored locally through `DataProvider`; quiz aggregates are not student records and cross-profile aggregation is unavailable. |
| Quiz and history | One question at a time, feedback and saved attempt history | Create quiz with lesson; aggregate score/attempts | Manage lesson quizzes | Partial | Percentage calculation is shared and unit-tested; API still trusts the supplied score rather than verifying answers against the quiz. |
| Exams | Filter/list Bac subjects and corrections gated by subscription | Create/edit/delete own exam entries | Manage all exam entries | Partial | Ownership and correction filtering are in API; local profile separation prevents shared workflow. |
| Payments and subscriptions | Upload receipt, view history/status | No payment/contact APIs exposed by role-based API methods | Approve/reject with reason | Partial | Admin approval calculates 1/3/10-month plan expiry and subscription expiry is checked; everything is local to one profile. |
| Live sessions / rooms | Current/upcoming/replay listing, join window, questions/resources, hand-raise UI | Manage sessions, start/end, resources, moderate questions | View/cancel sessions and attendance totals | Partial | API and UI exist. Actual service requires credentials, production token and permissions fail closed pending server auth; localStorage is not shared. |
| Teacher content | View published student-facing content | Create subjects; CRUD own modules/lessons, videos, exercises, quizzes and exams; draft preview | Manage all content and reassign/unpublish | Partial | Curriculum ownership, visibility, ordering, trash restore and video URL rules are covered by unit tests. Browser flow verified teacher-created subject → module → video lesson → publish → student sees it, then admin unpublishes and student access disappears. |
| Student / teacher administration | — | — | Search/filter/block students; create teachers; assign subjects; settings | Partial | Implemented in UI/API but local-only; admin forms/actions lack robust request error/loading states in every path. |
| Notifications | User-scoped bell feed | User-scoped bell feed | User-scoped bell feed | Partial | Events generated for payment decisions, live starts and published lessons; browser-local only. |
| Search | Global published lesson search | Global published lesson search | Global published lesson search | Partial | Search returns only lessons allowed by current API access rules; browser-only validation pending. |
| Dark mode | Toggle and persisted preference | Toggle and persisted preference | Toggle and persisted preference | Partial | Preference persists through provider; no visual browser review at all breakpoints. |
| Demo reset | — | — | Development-only reset action | Partial | API requires admin and development; action preserves current admin session. |
| Automated tests | — | — | — | Partial | 29 Vitest unit tests pass. Playwright is not installed; the integrated browser was used for manual checks. |

## Curriculum ownership follow-up verification

| Check | Result |
|---|---|
| `npm run build` | Passed. |
| `npm run lint` | Passed with `--max-warnings=0`. |
| `npm run typecheck` | Passed. |
| `npm test` | Passed: 29 tests, including migration, published-only student visibility, teacher ownership rejection, cross-teacher deletion protection, ordering, trash restoration, and video URL parsing. |
| Teacher UI: create subject → module → add a validated MP4 link → add exercise and quiz → publish | Passed in the browser using the seed teacher account. |
| Student UI: find the published subject and lesson, open it and inspect its video/summary | Passed; player used that lesson's MP4 URL. |
| Student UI: open a paid lesson without a subscription | Passed; content remained locked. |
| Admin UI: unpublish the test lesson; student opens its URL | Passed; lesson details were not returned, and the student saw “Page introuvable” rather than a misleading subscription prompt. |
| Teacher studio, lesson editor, and admin content management at 375/768/1280px | No horizontal overflow; visible controls measured at least 44px after responsive fixes. |
| Demo data cleanup | Passed; used the development-only admin reset after manual testing. |

The browser flow used separate roles in one browser profile because localStorage is per-browser and is not shared across profiles. A direct second-teacher UI session was not exercised; owner-denial and protection against deleting shared contributions are covered by unit tests.

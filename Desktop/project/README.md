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

## Demo accounts (repli local uniquement)

Ces comptes sont disponibles uniquement lorsque Supabase n’est pas configuré. Les mots de passe de démonstration sont hachés localement avec PBKDF2-SHA256 et enregistrés dans `edubac:accounts`.

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

Les composants passent par `lib/api.ts`. Sans configuration Supabase, l’authentification de démonstration et les données utilisent le fournisseur local. Avec Supabase configuré, l’authentification, les profils et les filières utilisent Supabase Auth/Postgres; les autres données de l’application restent locales pour le moment. `lib/data/config.ts` sélectionne encore `localProvider`.

La règle d’accès métier reste dans `lib/api.ts`; les composants ne doivent accéder directement ni à Supabase ni au stockage local. Les opérations Supabase d’identité et de filières sont regroupées dans cette API. L’adaptateur `DataProvider` complet pour les classes, cours, devoirs, paiements et séances reste à implémenter avant de considérer les données métier migrées.

## Supabase : état et configuration

Les migrations `supabase/migrations/20261124163000_secure_identity_foundation.sql` et `supabase/migrations/20261124170000_fix_public_sections_policy.sql` ont été exécutées sur le projet Supabase relié à cet environnement. Vérification dans le projet : les tables `sections`, `profiles` et `profile_private` existent avec RLS activé; les 7 filières sont présentes; l’endpoint public des filières répond avec succès. Pour un autre projet, exécutez les migrations dans l’ordre chronologique depuis le SQL Editor Supabase.

Copiez `.env.example` vers `.env.local`, puis renseignez `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. La clé publiable peut être exposée au navigateur; n’utilisez jamais la clé `service_role` dans `NEXT_PUBLIC_*` ni dans le code client.

Configurez l’URL du site et la liste des redirections d’authentification dans Supabase (par exemple `http://localhost:3000/login` en développement et l’URL de production). L’inscription crée toujours un compte élève et son profil; si la confirmation Supabase est activée, l’interface demande de confirmer le compte avant la connexion. La connexion par téléphone nécessite également un fournisseur SMS activé dans Supabase; elle n’a pas été vérifiée ici.

Les numéros de téléphone sont conservés dans `profile_private`, séparés du profil public et lisibles par leur propriétaire ou un administrateur via les politiques RLS. Un premier administrateur doit être promu depuis le SQL Editor après sa création dans Auth, par exemple :

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'admin@example.tn');
```

La création sécurisée de comptes enseignants depuis l’interface d’administration nécessite encore une fonction serveur privilégiée; elle est donc désactivée en mode Supabase. Le proxy renouvelle les cookies de session, mais ne remplace pas encore les contrôles d’accès serveur pour toutes les routes.

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

Les opérations UI passent par `lib/api.ts`, qui applique les règles métier avant le stockage. Les contrôles des classes, inscriptions, contenus, paiements et rôles métier utilisent encore les données locales et ne constituent pas une frontière de sécurité. Le schéma Supabase actuel ne couvre que l’identité et les filières; il faut encore créer des tables relationnelles et des politiques RLS pour les données métier avant de les migrer. Les paiements restent manuels et désactivés par défaut.

## Curriculum ownership and videos

The curriculum hierarchy is **Subject → Module → Lesson → videos, exercises, quiz and PDF**. Teachers can create subjects when the platform setting permits it. A subject may have multiple teacher owners; its owners can update its details. Any teacher can contribute modules and lessons, and may edit, duplicate, reorder or delete only the content they own. A teacher cannot delete a subject or module that contains another teacher’s contributions. Administrators can edit all content, change owners, and unpublish any item. All ownership checks are in `lib/api.ts`.

Student catalog calls return published subjects, modules and lessons in their configured order, further filtered by free-preview status or accepted enrollment in a class that publishes the lesson. If group payments are enabled, a valid paid period is also required. Drafts remain private to their owner and administrators. Deletes are soft-deletes retained in the teacher studio trash for 30 days.

Existing browser data migrates from the legacy keys to versioned `edubac:v2:*` curriculum keys without deleting the old values. Legacy modules infer ownership from their first lesson when ownership metadata is absent; the built-in sample curriculum belongs to the seed teacher.

Lesson videos are links only. YouTube, Vimeo, Bunny Stream and direct HTTPS MP4 URLs are parsed and embedded by `lib/video/parse.ts`; `lib/video/storage.ts` implements the `VideoStorage` link mode. The URL format is validated locally, but provider reachability, privacy and playback permissions cannot be verified without provider APIs. Real video-file upload requires an external storage implementation. Student MP4 playback position, speed and 90% completion are persisted locally; embedded-provider playback telemetry is not available. PDFs are stored as validated data URLs (maximum 3 MB), which is prototype-only and should move to object storage.

`npm test` runs Vitest coverage for local data validation and migration, class enrollment/content access, optional group payments and grace periods, teacher roster privacy/scope, scheduling and session generation, attendance, homework correction, group grade calculations, subscription/payment behavior, teacher ownership, publication visibility, moderation, video URL parsing, blocked accounts and quiz scoring. Playwright is not installed, so browser-level checks are manual. Separate browser profiles cannot share localStorage data.

In development, administrators can use **Réinitialiser les données de démonstration** to restore the current browser's demo data. The action is hidden outside development and requires an administrator session.

## Live

Live sessions take place inside Learn With Me using LiveKit audio/video rooms; teachers do not create or share Teams links. Teachers schedule and start sessions from their dashboard, and students join `/live/[id]`. Session questions and links/files are shown in the in-platform side panel. Group sessions are visible only to accepted students with payment access when payments are enabled. Legacy external meeting links are discarded during migration and converted to in-platform sessions.

The local prototype stores session metadata and group-material metadata through `lib/api.ts` and `DataProvider`. Binary resources (PDFs, Office documents, images, audio/video, text, and ZIP files; 10 MB maximum each) are stored in IndexedDB by the local provider rather than `localStorage`. Executables and active script formats are rejected. The database adapter should replace `DataProvider` attachment methods with private object storage and signed, authorization-checked downloads.

Local role/enrollment checks are application logic only: browser storage can be edited. Do not treat the current prototype as secure authorization.

The LiveKit packages are `livekit-client`, `@livekit/components-react`, `@livekit/components-styles`, and `livekit-server-sdk`. Copy `.env.example` to `.env.local` and set:

```text
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-server-api-key
LIVEKIT_API_SECRET=your-server-api-secret
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
```

Create a free project in [LiveKit Cloud](https://cloud.livekit.io/), then copy the project URL and server API credentials from its project settings. Keep `LIVEKIT_API_SECRET` server-only: never prefix it with `NEXT_PUBLIC_` or expose it to browser code. `LIVEKIT_URL` is used by server-side room administration; `NEXT_PUBLIC_LIVEKIT_URL` is the secure WebSocket URL sent to the room client.

Start the app with `npm run dev` and configure LiveKit before trying to join a room. LiveKit provides the real-time media transport; students and teachers stay in the Learn With Me interface. The local browser data layer does not synchronize users, sessions, questions, or subscriptions between profiles, so a complete two-profile class session requires shared server-side data.

**Limite de sécurité du prototype :** lorsque Supabase est configuré, l’identité passe par Supabase Auth, mais les inscriptions, abonnements et permissions LiveKit ne sont pas encore migrés. `verifyLiveAccess` refuse volontairement l’émission de jetons en production tant que l’accès n’est pas vérifié côté serveur. Les contrôles d’accès des routes restent incomplets; ne déployez pas les fonctions métier comme autorisation sécurisée avant leur migration vers des vérifications serveur et RLS.

The initial capacity limit is `MAX_STUDENTS_PER_SESSION = 30` in `lib/livekit-config.ts`. The teacher session form shows the estimated participant-minutes at this limit; token issuance rejects extra students.

## Données métier restant à migrer

Le `DataProvider` actif est encore `localProvider` dans **`lib/data/config.ts`**. Avant de le remplacer, créer un adaptateur Supabase relationnel couvrant au minimum les données suivantes, avec une politique RLS par table :

- Accounts, current user, users, sections, class groups, enrollments and language/theme preferences
- Subjects (with modules and embedded lesson/exercise/quiz metadata), lessons, lesson drafts, deleted lesson IDs, content trash, exams, and settings
- Quiz metrics and per-user quiz results, lesson completion, and last-viewed lesson
- Per-user, per-video playback positions
- Platform and per-group payments/subscriptions
- Group content links, schedule polls/votes, reschedule requests, attendance, class logs, assessments, grades and audit entries
- Live sessions, questions, and attendance
- Group-material metadata; attachment bytes through `readAttachment`, `writeAttachment`, `deleteAttachment`, and `clearAttachments`
- Lesson view counts, teacher subject assignments, and notifications

Garder les règles d’accès dans `lib/api.ts`; les composants doivent continuer à utiliser cette API et ne pas accéder directement au stockage. Toute migration doit préserver les règles de confidentialité et être couverte par des tests d’intégration RLS. Les méthodes API ont encore des contrats de retour hétérogènes.

`lib/auth.ts` utilise Supabase Auth si les variables publiques sont présentes; PBKDF2 ne sert qu’au repli local de démonstration. Les routes ont encore des gardes côté client; ajouter les contrôles de rôle serveur avant déploiement.

## Current limitations

Supabase est connecté uniquement pour Auth, les profils et les filières; groupes, cours, devoirs, paiements, progression et séances restent dans `localStorage`/IndexedDB. Il n’y a pas de paiement en ligne ni d’autorisation complète côté serveur. Les reçus et devoirs sont encore des data URLs; les ressources de groupe/en direct utilisent IndexedDB. Les leçons intégrées sont des exemples sans vidéos ni PDF. LiveKit est configuré séparément et la production refuse les jetons tant que l’autorisation serveur n’est pas achevée. Les vérifications de rôle côté client ne sont pas une frontière de sécurité.

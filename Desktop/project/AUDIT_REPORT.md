# Audit technique et fonctionnel — EduBac

## Résumé exécutif — 10 lignes
1. Le projet est un prototype Next.js 16 / React 19 en français, structuré autour de classes de Bac et d’un fournisseur de données local.
2. Après corrections, `npm run build`, `npm run lint`, `npm run typecheck` et `npm test` réussissent; Vitest rapporte 65 tests. `npm audit` rapporte 0 vulnérabilité.
3. La connexion, l’inscription, les erreurs de saisie, le quiz gratuit et l’enregistrement de la progression ont été vérifiés dans le navigateur.
4. Les tests navigateur ont couvert des parcours visiteur, élève, enseignant et administrateur, avec captures d’écran dans `audit-artifacts/`.
5. Une modification de `localStorage` permettant de se faire passer pour un administrateur a été reproduite : l’autorisation n’est pas exploitable en production.
6. `/teachers` est désormais public; les routes protégées utilisent une correspondance par segment plutôt qu’un préfixe ambigu.
7. Les contrôles d’accès UI des leçons, corrections et séances sont alignés sur les autorisations de l’API et le réglage de paiement.
8. À 375, 768 et 1280 px, les pages principales élève, enseignant et administrateur testées n’ont pas de débordement; aucune cible visible mesurée n’est sous 44 px à 375 px.
9. Le panneau mobile de notifications reste dans la fenêtre; certains constats de sécurité demeurent impossibles à corriger tant que les rôles sont stockés dans `localStorage`.
10. Les parcours complets de paiement, de modération en navigateur, de visioconférence réelle et de bout en bout entre plusieurs profils n’ont pas été validés.

## 1. Périmètre et méthode

Audit initial effectué le 23 novembre 2026 et corrections revérifiées le 24 novembre 2026 sur `C:\Users\belar\Desktop\project`. Les routes, les principaux composants, la couche API, le fournisseur local, l’authentification, les types, les tests, le README et les configurations ont été examinés. Des recherches transversales ont ciblé les accès au stockage, les erreurs, les marqueurs TODO, les liens morts et les types explicites. Vu la taille de certains fichiers, cette revue ne constitue pas une lecture ligne par ligne de chaque fichier.

Les parcours navigateur ont été conduits avec l’outil navigateur disponible, pas avec une suite Playwright du dépôt. Les captures sont dans [audit-artifacts/](audit-artifacts/). Les mutations de données ont été limitées aux comptes de démonstration et à un compte QA temporaire. Le compte QA et ses clés par utilisateur ont été retirés; les agrégats globaux `lessonViews`, `quizMetrics` et `teacherEngagement` n’ont pas été réinitialisés, car leurs valeurs initiales n’avaient pas été sauvegardées. Les compteurs locaux peuvent donc encore refléter une partie des essais.

## 2. Architecture et pile technique

| Zone | Contenu observé |
|---|---|
| Pile | Next.js 16.4.6 App Router, React 19, TypeScript 5.7, Vitest 5, Zod 4, CSS global et composants Lucide. |
| Pages publiques | `/`, `/login`, `/register`, `/groups`, `/groups/[id]`, `/teachers`, `/teachers/[id]`, `/pricing`; les catalogues `/subjects`, `/subjects/[id]`, `/lessons/[id]`, `/exams` et `/live` sont aussi consultables selon les règles de contenu. |
| Élève | `/dashboard`, `/profile`, `/student/groups`, `/student/homework`, `/student/record`, `/student/schedule`, ainsi que les cours, examens et séances. |
| Enseignant | `/teacher`, `/teacher/content`, `/teacher/groups`, `/teacher/students`, `/teacher/questions`, `/teacher/homework`, `/teacher/schedule`, `/teacher/announcements`. |
| Administrateur | `/admin`, `/admin/groups`, `/admin/moderation`; les réglages et paiements sont intégrés au tableau de bord. |
| API de serveur | `/api/live/token`, `/api/live/permissions`, `/api/live/end`; les pages sont principalement côté client. |
| Principaux composants | `components/layout/app-shell.tsx` (navigation et rôle), `components/groups/group-pages.tsx`, `components/relationships/relationship-pages.tsx`, les espaces `student/`, `teacher/`, `admin/`, et les fournisseurs `shared/`. |
| Données | Les composants appellent `lib/api.ts`; `lib/data/config.ts` sélectionne `localProvider`, qui valide et persiste les valeurs dans `localStorage`. Le contrat asynchrone `DataProvider` est dans `lib/data/provider.ts`. |
| Authentification | `lib/auth.ts` calcule un hash PBKDF2-SHA256 côté navigateur. Le compte courant, les comptes et les utilisateurs résident dans `localStorage`; `proxy.ts` ne fait qu’un pass-through. |
| Langue et état | Dictionnaire français unique dans `lib/i18n.ts`, `LanguageProvider` et `AuthProvider`; l’état métier est chargé via l’API et conservé localement. |

Le découpage du fournisseur rend le stockage remplaçable, mais l’API mélange encore des retours bruts, des `ApiResult` et des exceptions. Un backend réel exigera une authentification serveur et les mêmes règles d’accès dans les politiques de base de données.

## 3. Résultats des commandes

| Vérification | Résultat |
|---|---|
| `npm install` | Non exécuté : `node_modules` était déjà présent et aucune dépendance ne manquait. |
| `npm run build` | **PASS**. Compilation, vérification TypeScript et génération des 33 pages réussies. Le tableau de routes distingue les routes statiques et dynamiques; aucune erreur de build affichée. |
| `npm run lint` | **PASS**, sans avertissement (script configuré avec `--max-warnings=0`). |
| `npm run typecheck` | **PASS**. |
| `npm test` | **PASS après corrections**, 65 tests; les suites couvrent notamment les permissions, les groupes, le paiement optionnel, l’ordonnancement, les notes, la modération, les messages, les visiteurs anonymes et les erreurs API ciblées. |
| `npm audit` | **PASS**, 0 vulnérabilité rapportée lors de l’audit exécuté. |
| `npm outdated` | **NON CONCLUANT** : la requête au registre npm a échoué avec `ECONNRESET` en récupérant les métadonnées de `react`. Aucune conclusion sur les versions obsolètes n’est possible. |

Le build a produit 18 fichiers dans `.next/static/chunks`, environ 2 011 635 octets au total; le plus gros fichier observé mesure 969 393 octets. Ce sont des tailles brutes de fichiers, pas une mesure gzip ou par route. Aucun fichier n’a été trouvé dans `public/`. Le build n’affiche pas de taille de bundle par page.

## 4. Matrice des fonctionnalités

`PASS` = vérifié dans le navigateur ou par un test pertinent; `FAIL` = écart reproductible; `PARTIEL` = une partie seulement vérifiée; `NON TESTÉ` = aucune preuve directe suffisante.

| Fonctionnalité | Visiteur | Élève | Prof | Admin | Statut | Remarques |
|---|---|---|---|---|---|---|
| Page d’accueil et navigation publique | PASS | PASS | PASS | PASS | PASS | Accueil et navigation consultés; les pages publiques de cours restent soumises aux règles d’accès. |
| Inscription / connexion | PASS | PASS | PASS | PASS | PASS | Formulaire invalide, e-mail dupliqué, identifiant inconnu et mauvais mot de passe testés. |
| Répertoire et profils enseignants | PASS | PASS | PARTIEL | PARTIEL | PASS (revérifié) | `/teachers` s’affiche comme route publique après correction de la correspondance de segment; ouverture directe testée. |
| Classes et inscriptions | PASS | PARTIEL | PARTIEL | PARTIEL | PARTIEL | Classes de démonstration, statut d’inscription et dossier élève observés; la demande puis acceptation en direct n’a pas été jouée de bout en bout. |
| Cours, accès et quiz | PASS | PASS | PARTIEL | PARTIEL | PASS / PARTIEL | Un élève avec inscription acceptée a ouvert une leçon privée; le même cours est masqué après déconnexion. Les visiteurs ne reçoivent désormais que les aperçus gratuits publiés. Les parcours quiz n’ont pas été rejoués après les corrections. |
| Emploi du temps et sondage de créneaux | PARTIEL | PARTIEL | PARTIEL | PARTIEL | PARTIEL | Données de démonstration et pages observées; vote réel, fixation et conflits entre profils non rejoués dans le navigateur. |
| Direct intégré et ressources de séance | — | NON TESTÉ | NON TESTÉ | — | PARTIEL | La salle LiveKit et l’API de ressources sont présentes; Teams n’est plus proposé. Les jetons de production restent bloqués tant qu’une authentification serveur et des données partagées ne sont pas configurées. |
| Devoirs et notes | PARTIEL | PARTIEL | PARTIEL | PARTIEL | PARTIEL | File et pages vides/formulaires observés; dépôt puis correction et affichage élève non validés en navigateur. Tests unitaires présents. |
| Messagerie, rapports et modération | PARTIEL | PARTIEL | PARTIEL | PARTIEL | PARTIEL | Tests API de masquage, limite et modération présents; chaîne complète entre deux comptes non jouée. |
| Paiements | PASS | PARTIEL | PARTIEL | PARTIEL | PARTIEL | État « Paiements désactivés » observé; reçu, validation/rejet et durée d’abonnement non testés car la fonction est désactivée. |
| Administration et KPIs | — | — | — | PARTIEL | PARTIEL | Tableau de bord et classes consultés. Les compteurs sont issus des données locales; tous les calculs n’ont pas été recalculés indépendamment. |
| Protection des rôles | — | FAIL | FAIL | PARTIEL | FAIL | Refus UI enseignant→admin observé; l’altération de `localStorage` donne accès à l’espace administrateur. |
| Thème sombre | PASS | PASS | PASS | — | PASS | Bascule puis retour au thème clair vérifiés. |
| Responsive / accessibilité | PARTIEL | PARTIEL | PARTIEL | PARTIEL | PARTIEL | Après correction, mesures navigateur à 375, 768 et 1280 px sur `/teachers` et `/dashboard` élève : aucun débordement ni contrôle visible inférieur à 44 px; panneau notifications contenu à 375 px. Le reste des pages, clavier et contraste ne sont pas audités exhaustivement. |
| Visioconférence LiveKit | NON TESTÉ | NON TESTÉ | NON TESTÉ | NON TESTÉ | NON TESTÉ | Aucun test de salle multi-participants ni de fournisseur configuré. Le README indique que l’émission de jetons refuse la production sans authentification serveur. |

## 5. Défauts et problèmes constatés

### SEC-01 — Autorisation administrateur falsifiable depuis le navigateur
- **Sévérité : Bloquant avant mise en production**; rôles concernés : tous.
- **Page/fichiers :** `lib/api.ts:491-497`, `components/layout/app-shell.tsx:61-71`, `proxy.ts:4`.
- **Reproduction :** connecté comme élève, modifier dans les outils développeur `edubac:user` et l’enregistrement correspondant dans `edubac:users` pour leur attribuer le rôle `admin`, puis charger `/admin`.
- **Attendu :** identité et rôle validés par le serveur; aucune donnée de compte local ne peut accorder des droits.
- **Observé :** la route administrateur devient accessible après modification du stockage local. La même approche a permis de forger une inscription acceptée et de lire le cours privé.
- **Capture :** [élévation de rôle](audit-artifacts/security-localstorage-role-escalation.png), [inscription forgée](audit-artifacts/security-forged-enrollment-unlocks-lesson.png).
- **Correction suggérée :** sessions signées et vérifiées côté serveur, autorisation côté API serveur et politiques de base de données; ne pas considérer `localStorage` ou les gardes React comme une frontière de sécurité.

### SEC-02 — Un visiteur pouvait charger une leçon privée par son URL
- **Sévérité : Majeur**; rôles concernés : visiteur et élèves non inscrits.
- **Page/fichier :** `/lessons/[id]`, `lib/api.ts:378-399`.
- **Reproduction avant correction :** ouvrir `/lessons/lesson-2` sans session.
- **Attendu :** seuls les aperçus gratuits, publiés, sont disponibles au visiteur.
- **Observé :** le visiteur pouvait charger le contenu publié non gratuit de la leçon et ses exercices/quiz. Le contrôle d’inscription ne s’exécutait que pour un utilisateur au rôle `student`.
- **Capture :** [leçon privée chargée comme visiteur](audit-artifacts/visitor-lessons-lesson-2.png).
- **Correction suggérée :** filtrer l’API par statut et aperçu gratuit pour les visiteurs; refuser aussi la lecture directe d’une leçon privée.
- **État après corrections :** **Corrigé et vérifié** par tests d’accès anonyme dans `tests/api.test.ts` et par navigation visiteur : la même URL affiche « Page introuvable » et n’expose plus le titre ni le contenu.

### ACC-01 — Le répertoire public `/teachers` est protégé par le préfixe `/teacher`
- **Sévérité : Majeur**; rôles concernés : visiteur et élève.
- **Page/fichiers :** `components/layout/app-shell.tsx:62-63`, `lib/route-matching.ts:1`; page `/teachers`.
- **Reproduction :** ouvrir `/teachers` sans session ou avec un compte élève.
- **Attendu :** afficher le répertoire public de professeurs.
- **Observé :** le contrôle `pathname.startsWith('/teacher')` englobe aussi `/teachers`; un visiteur est envoyé vers la connexion et l’élève vers son tableau de bord.
- **Capture :** [répertoire public redirigé vers la connexion](audit-artifacts/visitor-teachers.png).
- **Correction suggérée :** comparer des routes exactes ou des segments (`/teacher` ou `/teacher/...`) et conserver `/teachers` public.
- **État après corrections :** **Corrigé et revérifié**. `matchesRoute` protège `/teacher` et ses sous-routes sans capturer `/teachers`; la visiteuse a chargé `/teachers`, puis `/teachers/teacher-3` sans connexion, et le test unitaire dédié réussit.

### ACC-02 — Plusieurs composants d’élève vérifient l’abonnement plateforme au lieu de l’accès de classe
- **Sévérité : Majeur**; rôle concerné : élève inscrit.
- **Pages/fichiers :** `components/student/student-catalog.tsx:49,72,96`, `components/student/live-room-page.tsx:31`; règle centrale dans `lib/api.ts:351-387`.
- **Reproduction :** utiliser un élève ayant une inscription acceptée à une classe, laisser `paymentsEnabled=false`, puis consulter `/subjects/[id]`, `/exams` ou une séance de groupe.
- **Attendu :** l’inscription acceptée donne accès aux contenus, corrections et séances conformément au mode gratuit.
- **Observé :** `LessonLink`, `ExamList` et le rendu des séances évaluent encore `subscription.status === 'Active'`; la leçon est marquée verrouillée et les actions de correction/rejoindre renvoient à `/pricing`, malgré l’accès accordé par l’API. Le contraste entre l’API et les composants a été constaté dans le catalogue.
- **Capture :** [catalogue de l’élève](audit-artifacts/student-subjects-math.png), [classe acceptée](audit-artifacts/student-groups-group-math-math.png).
- **Correction suggérée :** exposer l’état d’accès par classe depuis `lib/api.ts` et l’utiliser dans chaque composant d’accès; ne pas dériver l’accès d’un abonnement plateforme lorsque les paiements sont désactivés.
- **État après corrections :** **Corrigé dans les composants concernés**. `getContentAccess` dans `lib/api.ts` pilote les leçons, corrections et séances. Les tests vérifient l’accès avec paiements désactivés et la règle d’abonnement quand ils sont activés; le rendu navigateur des corrections et séances n’a pas été rejoué.

### UX-01 — Panneau de notifications rogné et commandes recouvertes sur mobile
- **Sévérité : Mineur**; tous les rôles.
- **Page/fichiers :** `components/layout/header-tools.tsx:130-220`, `app/globals.css:4435-4449`.
- **Reproduction :** à 375 px, ouvrir la page `/pricing`, puis le panneau Notifications.
- **Attendu :** panneau contenu dans la fenêtre et commandes d’en-tête utilisables.
- **Observé :** largeur mesurée 351 px, bord gauche à environ `-83 px`; `scrollWidth=368` contre `clientWidth=360`. Le panneau recouvre aussi la zone du bouton de thème, dont le clic a été intercepté.
- **Capture :** [panneau mobile ouvert](audit-artifacts/ux-notifications-mobile-open.png).
- **Correction suggérée :** positionner le panneau relativement au viewport sur petit écran et éviter qu’il recouvre les commandes voisines.
- **État après corrections :** **Corrigé et revérifié** à 375, 768 et 1280 px : le panneau reste dans la fenêtre (bornes horizontales respectives 12–348, 147–507 et 659–1019 px). Les commandes d’en-tête restent accessibles; Escape et un clic extérieur ferment le panneau.

### UX-02 — Libellé de soumission de connexion inadapté
- **Sévérité : Mineur**; visiteur.
- **Page/fichiers :** `components/shared/auth-form.tsx:101`, `lib/i18n.ts:32`.
- **Reproduction :** ouvrir `/login`.
- **Attendu :** bouton « Se connecter » (et libellé de création explicite sur l’inscription).
- **Observé :** le bouton utilise la clé générique `submit`, traduite par « Enregistrer ».
- **Capture :** [formulaire de connexion](audit-artifacts/visitor-login-wrong-password.png).
- **Correction suggérée :** utiliser des libellés dédiés à la connexion et à la création de compte.
- **État après corrections :** **Corrigé et vérifié dans le navigateur** : `/login` affiche « Se connecter » et `/register` affiche « Créer mon compte ».

### I18N-01 — Certaines erreurs métier peuvent apparaître en anglais
- **Sévérité : Mineur**; élève et enseignant.
- **Fichiers :** `lib/api.ts` (`API_ERROR_CODES`, `getApiErrorCode`), `components/shared/api-error.ts` et les composants qui l’utilisent.
- **Reproduction :** provoquer une erreur métier dans une action de relation (permission, état invalide ou opération inaccessible).
- **Attendu :** message de validation en français.
- **Observé :** plusieurs composants transmettent directement la chaîne de l’API à `toast.error`; le traducteur ne couvre qu’une liste partielle et certaines erreurs API sont en anglais.
- **Capture :** constat statique; aucune capture d’un toast anglais n’a été prise.
- **Correction suggérée :** centraliser les codes d’erreur stables et les traductions françaises; éviter d’afficher les messages bruts de l’API.
- **État après corrections :** **Corrigé pour l’affichage UI**. Les composants passent les erreurs à `translateApiError` ou `showApiError`; tous les codes stables ont une clé française et les messages inconnus deviennent l’erreur générique française. `rg` ne trouve plus d’appel direct `toast.error(result.error)`/`toast.error(response.error)`. Les contrats API historiques transportent encore des chaînes internes, normalisées avant affichage.

### UX-03 — Cibles tactiles de moins de 44 px
- **Sévérité : Mineur**; tous les rôles, surtout mobile.
- **Fichiers :** `app/globals.css:5163-5172` (règle mobile globale des cibles interactives).
- **Reproduction :** mesurer les éléments interactifs à 375 px dans le tableau de bord ou le cours.
- **Attendu :** cibles d’au moins 44 × 44 px.
- **Observé :** plusieurs liens mesurés entre 26 et 42 px de haut; l’entrée de recherche mesure 42 px de large sur une route étroite. Le nombre varie selon la page.
- **Capture :** [tableau de bord élève](audit-artifacts/student-dashboard.png), [cours](audit-artifacts/student-lessons-lesson-1.png).
- **Correction suggérée :** appliquer une taille minimale de 44 px aux commandes interactives et vérifier les zones de clic réelles.
- **État après corrections :** **Corrigé et vérifié à 375 px**. Mesures sur `/dashboard`, `/student/groups`, `/subjects`, `/teacher`, `/teacher/groups`, `/teacher/students`, `/admin`, `/admin/groups` et `/admin/moderation` : aucune cible visible sous 44 px. Ces pages ne débordent pas non plus à 768 et 1280 px. Quelques contrôles du tableau enseignant (cases natives et boutons d’annulation) sont plus petits à 768/1280 px; le seuil demandé ici concerne le mobile.

### Correctifs connexes demandés

| Point | État | Preuve |
|---|---|---|
| ESLint `no-explicit-any` et `no-unused-vars` | **Fixed** | Règles réactivées dans `eslint.config.mjs`; `npm run lint` passe avec `--max-warnings=0`. |
| Composants et dépendances morts | **Fixed** | `components/ui/button.tsx` et `lib/utils.ts` supprimés après recherche d’imports; les dépendances directes inutilisées et `@vercel/analytics` retirées. `clsx` reste dans les lockfiles uniquement comme dépendance transitive de `@livekit/components-react`. Alias `utils` supprimé de `components.json`. |
| Avertissements Next.js | **Fixed** | `data-scroll-behavior="smooth"` présent sur `<html>`; préchargement de la police désactivé (`preload: false`); Analytics Vercel supprimé. Build de production sans avertissement correspondant. |

## 6. Parcours navigateur : étapes, résultats et limites

| Parcours | Résultat observé | Statut | Capture |
|---|---|---|---|
| Visiteur : accueil, catalogues, répertoire et profil professeur | Accueil et catalogues chargés; `/teachers` et `/teachers/teacher-3` s’affichent sans session. Les autres pages publiques n’ont pas toutes été revisitées. | PARTIEL | [accueil](audit-artifacts/visitor-landing.png), [classes](audit-artifacts/visitor-groups.png) |
| Inscription : champs invalides, création, e-mail dupliqué | Erreurs de validation et doublon visibles; compte QA créé puis retiré après l’audit. | PASS | [inscription](audit-artifacts/student-registration-valid.png), [doublon](audit-artifacts/visitor-register-duplicate-email.png) |
| Connexion : mauvais mot de passe et compte inconnu | Les deux cas refusés avec message français; la connexion valide au compte de démonstration a réussi. | PASS | [mauvais mot de passe](audit-artifacts/visitor-login-wrong-password.png), [compte inconnu](audit-artifacts/visitor-login-unknown-user.png) |
| Quiz et progression | Quiz gratuit terminé, score affiché, progression et historique actualisés. | PASS | [résultat du quiz](audit-artifacts/student-quiz-result.png), [leçon terminée](audit-artifacts/student-lesson-completed.png) |
| Contenu privé et paiement désactivé | Tests API couvrent les inscriptions acceptées/refusées et le mode paiements activés/désactivés. Le contournement par modification de stockage local reste possible (SEC-01); corrections et séances n’ont pas été revérifiées visuellement. | PARTIEL | [refus normal](audit-artifacts/student-lesson-private-denied.png), [contournement local](audit-artifacts/security-forged-enrollment-unlocks-lesson.png) |
| Visiteur/élève vers les routes protégées | `/dashboard`, `/teacher`, `/admin` testés; redirections observées. | PASS avec réserve SEC-01 | [visiteur vers admin](audit-artifacts/visitor-admin.png), [élève vers admin](audit-artifacts/security-student-admin-blocked.png) |
| Enseignant | Tableau, groupes, élèves, contenu, questions, devoirs, emploi du temps, annonces, messages et notifications ouverts; aucune adresse e-mail ni téléphone étudiant n’a été observé dans les pages visitées. | PARTIEL | [groupes enseignant](audit-artifacts/teacher-teacher-groups.png), [élèves](audit-artifacts/teacher-teacher-students.png) |
| Enseignant vers `/admin` | Redirection vers l’espace enseignant. | PASS | [route admin refusée](audit-artifacts/teacher-admin-direct.png) |
| Administrateur | Tableau et classes consultés; le contenu affichait des données locales. La modération détaillée et les actions d’approbation n’ont pas été exercées en UI. | PARTIEL | [tableau admin](audit-artifacts/admin-dashboard.png), [classes admin](audit-artifacts/admin-groups.png) |
| XSS dans le nom de profil | La chaîne de test a été affichée comme texte; aucun élément image ni exécution observée. | PASS pour ce champ testé | [profil XSS](audit-artifacts/security-xss-profile.png) |
| Thème et responsive | Thème sombre puis clair vérifiés. Pages principales élève, enseignant et admin mesurées à 375/768/1280 px sans débordement; aucune cible sous 44 px sur ces pages à 375 px. Panneau de notifications contenu aux trois largeurs; fermeture Escape et clic extérieur vérifiés. L’ensemble du site, le clavier et le contraste ne sont pas audités exhaustivement. | PARTIEL | [thème](audit-artifacts/theme-dark.png), [mobile](audit-artifacts/ux-notifications-mobile-open.png) |

### Parcours demandés mais non exécutés intégralement

- **Suivre → poser une question → réponse enseignant → notification élève :** non joué de bout en bout; tests unitaires de suivi, réponses et notification présents.
- **Soumettre un devoir → corriger → afficher la note :** non joué de bout en bout; tests unitaires de soumission, correction et notification présents.
- **Téléphone masqué dans un message → signalement → modération :** le masquage et le routage de rapport sont couverts par tests API; chaîne de deux utilisateurs non reproduite dans le navigateur.
- **Inscription → paiement/reçu → approbation admin → déverrouillage :** non testé; `paymentsEnabled` était désactivé.
- **Classe → demande → acceptation → sondage → créneaux récurrents → clôture/présences/devoirs/notes → dossier élève :** non joué de bout en bout. Les opérations correspondantes sont testées individuellement dans Vitest et les données de démonstration sont visibles.
- **Média LiveKit à deux participants :** non testé. Le stockage est local au profil navigateur; deux profils séparés ne partagent pas les sessions. Aucun service externe n’a été configuré pour cet audit.
- **Téléversements de reçus et pièces, données locales corrompues, double soumission, historique navigateur, clavier/focus et contraste :** non testés systématiquement.

### Console et réseau

Le serveur de production local répond en HTTP 200 sur `/teachers`; le build final ne signale plus l’avertissement de défilement ni le préchargement inutilisé. La police reste disponible mais n’est pas préchargée. Le script Analytics Vercel et sa requête `/_vercel/insights/script.js` ont été retirés. Les navigations Playwright rapides ont produit des requêtes RSC `ERR_ABORTED` lorsque la page changeait avant la fin du préchargement; aucune erreur JavaScript applicative n’a été observée dans ces vérifications.

## 7. Données, règles métier et confidentialité

| Règle | Couche actuelle | Évaluation |
|---|---|---|
| Leçon gratuite ou privée selon inscription et publication | `lib/api.ts` (`getSubjects`, `getLesson`, `studentCanAccessLesson`, `hasGroupContentAccess`) | Tests couvrant visiteurs, élèves inscrits et non inscrits; l’API locale reste falsifiable via le stockage navigateur (SEC-01). |
| Paiements optionnels et période de grâce | `lib/api.ts`, paramètres de plateforme et groupes | Tests des deux modes présents; catalogue, corrections et séances alignés sur l’accès de l’API après corrections. |
| Propriété des contenus et groupes | `lib/api.ts` | Plusieurs tests refusent les modifications d’un autre enseignant. |
| Roster enseignant limité | `getTeacherStudents` et `privateStudentName` dans `lib/api.ts` | Test unitaire et pages enseignantes consultées; affichage limité au prénom/initiale, filière et agrégats. Pas de contact ni de paiement observé. |
| Masquage et signalement | `maskContactInfo` et fonctions de messages, devoirs, commentaires et annonces dans `lib/api.ts` | Regex masque e-mail, téléphone et domaines/liens; tests de téléphone/message/modération présents. La complétude face à toutes les formes de coordonnées n’a pas été testée. |
| Limitation des messages | Constante `MAX_STUDENT_MESSAGES_PER_HOUR = 10` et paramètres relationnels | Test unitaire présent; limite locale, donc contournable et non atomique entre clients. |
| Comptes bloqués et rapports | `lib/api.ts` | Contrôles dans la logique locale et tests présents; aucune garantie sans session serveur. |
| Migrations et validation | `lib/data/local-provider.ts` | Préfixes versionnés `edubac:v2:*`/`edubac:v3:*`, validation Zod; les erreurs de parse sont converties en erreurs de stockage. Le rendu de toutes les pages avec stockage corrompu n’a pas été testé. |

**Accès direct au stockage :** la recherche dans les fichiers TypeScript confirme que les composants n’accèdent pas directement à `localStorage`; les accès de l’application sont concentrés dans `lib/data/local-provider.ts`. Les tests manipulent le stockage de manière attendue.

**Mots de passe et sessions :** les mots de passe sont hachés avec PBKDF2-SHA256 (100 000 itérations), mais les hash et le compte courant sont dans le navigateur. Les comptes de démonstration et mots de passe de démonstration sont documentés dans le README; ce modèle n’est pas une authentification de production. `proxy.ts` est explicitement un pass-through.

## 8. Faux, simulé ou manquant pour la production

- Pas de base de données ni de partage inter-navigateurs; classes, notes, paiements et progrès sont locaux.
- Pas de vraie session serveur, d’autorisation serveur générale ou de politiques de données utilisateur.
- Paiement manuel uniquement, désactivé par défaut; aucun prestataire ni traitement bancaire testé.
- Reçus et certains fichiers sont sérialisés en data URLs; pas de stockage objet ni de sauvegarde.
- Les cours intégrés sont des données de démonstration; les vidéos sont des liens et non des fichiers hébergés. Aucun lecteur vidéo de cours réel n’a été validé.
- LiveKit dépend de variables d’environnement et d’un service externe; le flux de production est volontairement refusé sans authentification serveur.
- E-mail/SMS, récupération de compte, sauvegardes, pages légales et politique de conservation n’ont pas été vérifiés comme services réels.
- Le README décrit les limites et le contrat à implémenter pour un backend, mais il n’existe pas encore d’adaptateur backend.

## 9. Dette technique et inventaire statique

| Fichier | Lignes |
|---|---:|
| `app/globals.css` | 4 424 |
| `lib/api.ts` | 3 857 |
| `components/groups/group-pages.tsx` | 1 147 |
| `tests/api.test.ts` | 854 |
| `components/relationships/relationship-pages.tsx` | 665 |
| `lib/data/local-provider.ts` | 742 |
| `types/index.ts` | 413 |

- `components/ui/button.tsx` et `lib/utils.ts` ont été supprimés après confirmation de l’absence d’import utilisateur; les dépendances directes `@base-ui/react`, `class-variance-authority` et `tailwind-merge` sont retirées. `clsx` reste uniquement transitif via `@livekit/components-react`. `@vercel/analytics` a aussi été retiré avec son composant d’intégration devenu inutile.
- Aucun `console.log`, `href="#"`, `@ts-ignore` ou TODO/FIXME applicatif n’a été trouvé par les recherches ciblées; le commentaire `FUTURE` de `proxy.ts` décrit la validation serveur à ajouter.
- Aucun `any` de production n’a été repéré; `eslint.config.mjs` active maintenant `@typescript-eslint/no-explicit-any` et `@typescript-eslint/no-unused-vars` en erreur. Lint passe sans avertissement.
- Les données de démonstration proviennent de `lib/mock-data.ts` et `lib/group-seed.ts`; compteurs et noms visibles sont à interpréter comme données locales, pas comme statistiques de production.
- La recherche de secrets dans les sources n’a pas révélé de clé codée en dur. `.env.local` n’a pas été ouvert; `.env.example` documente les variables LiveKit à configurer.
- `npm outdated` n’a pas pu comparer les versions à cause de l’indisponibilité réseau; seul `npm audit` a pu établir l’absence de vulnérabilité publiée dans l’exécution réalisée.

## 10. Priorités recommandées

| Rang | Action | Effort |
|---:|---|:---:|
| 1 | Remplacer le rôle/compte local par une session serveur vérifiée et des autorisations serveur avant tout déploiement. | L |
| 2 | Déplacer les règles de confidentialité, de débit, d’accès et de modération vers un backend atomique avec politiques par utilisateur. | L |
| 3 | Ajouter l’adaptateur de base de données et des tests d’intégration/concurrence sur capacités, notes et limites de débit. | L |
| 4 | Ajouter un parcours navigateur automatisé multi-rôle, incluant devoirs, paiements et modération. | L |
| 5 | Déplacer les reçus et pièces jointes vers un stockage objet privé avec téléchargement signé. | M |
| 6 | Tester le flux LiveKit multi-participants avec sessions authentifiées et données partagées. | M |
| 7 | Mettre en place sauvegarde, restauration et politique de conservation des données. | M |
| 8 | Scinder `lib/api.ts`, `globals.css` et les composants de pages volumineux par domaine. | M |
| 9 | Compléter les contrôles clavier, focus et contraste avec un audit d’accessibilité instrumenté. | M |
| 10 | Reprendre `npm outdated` lorsque le registre est accessible; aucun constat fiable de versions obsolètes n’est disponible. | S |

## 11. Prêt pour une vraie base de données ?

| Pré-requis | État |
|---|---|
| Contrat `DataProvider` typé et sélection centralisée | **Présent** (`lib/data/provider.ts`, `lib/data/config.ts`). |
| Données et migrations locales versionnées | **Présent pour le prototype**; migrations et schémas existent, mais le jeu de tests de récupération après corruption est incomplet. |
| Couche d’accès centralisée | **Présente** dans `lib/api.ts`; certains contrats bruts/exceptionnels restent à uniformiser. |
| Authentification serveur et sessions vérifiées | **Absent — bloquant**. |
| Autorisation serveur, règles par rôle et politiques par ligne | **Absent — bloquant**. |
| Protection des données mineurs, secrets et stockage de fichiers côté serveur | **À concevoir**; le stockage actuel est local et les uploads en data URL. |
| Concurrence et limites transactionnelles (capacité, débit, votes, notes) | **Non garanties** par `localStorage`; à transférer côté serveur. |
| Adaptateur base de données et tests d’intégration | **Absent**. |
| Sauvegarde, restauration, audit et stratégie de conservation | **Non vérifiés / absents**. |
| Paiement serveur | **Absent et volontairement désactivé**. |

**Conclusion :** le modèle métier et les interfaces de remplacement sont une base utile pour brancher un backend, mais le projet n’est pas prêt à recevoir une base de données en production avant l’authentification serveur, les contrôles d’accès serveur, l’adaptateur et les tests d’intégration.

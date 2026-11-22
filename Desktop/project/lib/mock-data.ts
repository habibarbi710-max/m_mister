import type { Subject, User } from '@/types'

const question = (id: string, prompt: string, choices: string[], answer: number, explanation: string) => ({
  id, prompt, choices, answer, explanation,
})

const quiz = (title: string) => ({
  id: `quiz-${title}`,
  title: `Quiz : ${title}`,
  questions: [
    question('q1', 'Quelle est la limite de sin(x)/x lorsque x tend vers 0 ?', ['0', '1', '∞', 'Indéfinie'], 1, 'Cette limite remarquable est égale à 1.'),
    question('q2', 'Quelle est la dérivée de x² ?', ['x', '2x', 'x²', '2'], 1, 'La règle de dérivation des puissances donne 2x.'),
    question('q3', 'Dans quel ensemble trouve-t-on le nombre i ?', ['Les réels', 'Les complexes', 'Les naturels', 'Les rationnels'], 1, 'i est l’unité imaginaire de l’ensemble des nombres complexes.'),
    question('q4', 'Quelle est l’unité de la constante de temps d’un circuit RC ?', ['Ampère', 'Ohm', 'Seconde', 'Volt'], 2, 'τ = RC et son unité est la seconde.'),
    question('q5', 'À quelle condition une fonction est-elle continue en a ?', ['Sa limite en a est égale à f(a)', 'Sa dérivée est nulle', 'f(a) = 0', 'Elle est croissante'], 0, 'La limite en a doit exister et être égale à la valeur de la fonction en a.'),
  ],
})

const lessons = [
  ['Limites et continuité des fonctions', 'Calcul des limites et étude de la continuité en un point', 'math', true],
  ['Asymptotes et comportement des fonctions', 'Limites à l’infini et détermination des asymptotes', 'math', false],
  ['Dérivation et applications', 'Règles de dérivation et tableaux de variations', 'math', true],
  ['Étude des fonctions exponentielles', 'Propriétés de la fonction exponentielle et résolution d’équations', 'math', false],
  ['Nombres complexes', 'Formes algébrique et trigonométrique, transformations', 'math', true],
  ['Suites numériques', 'Convergence et suites arithmétiques et géométriques', 'math', false],
  ['Intégrales et calcul des aires', 'Primitives et calcul intégral', 'math', false],
  ['Probabilités', 'Lois de probabilité et variables aléatoires', 'math', false],
  ['Oscillations mécaniques', 'Mouvement harmonique et énergie de l’oscillateur', 'physics', true],
  ['Circuit RC', 'Charge et décharge d’un condensateur, constante de temps', 'physics', true],
  ['Ondes mécaniques', 'Propagation des ondes et propriétés essentielles', 'physics', false],
  ['Induction électromagnétique', 'Loi de Faraday et applications de l’induction', 'physics', false],
  ['Physique nucléaire et radioactivité', 'Désintégration, activité et demi-vie', 'physics', true],
  ['Circuit RLC', 'Oscillations libres et échanges d’énergie', 'physics', false],
  ['Lumière et interférences', 'Phénomène d’interférence et conditions d’observation', 'physics', false],
] as const

const makeLesson = (index: number, row: typeof lessons[number]) => ({
  id: `lesson-${index + 1}`,
  title: row[0],
  duration: 18 + index % 4 * 5,
  videoUrl: '',
  summary: `Ce cours présente ${row[1]} selon le programme officiel du baccalauréat tunisien. Il commence par les notions essentielles, explique la méthode de résolution et se termine par des exemples types. Rédigez clairement chaque étape de la démonstration et vérifiez les conditions d’application des résultats.`,
  pdfUrl: '',
  exercises: [
    {
      prompt: `Exercice d’application : étudiez « ${row[0]} » et détaillez votre démarche.`,
      correction: 'Identifiez d’abord les données et le domaine de définition, puis appliquez la règle appropriée en justifiant chaque calcul. Vérifiez le résultat final à partir des données.',
    },
    {
      prompt: 'Question type Bac : déduisez le résultat et donnez son interprétation graphique.',
      correction: 'Utilisez le résultat précédent, puis reliez-le à sa représentation graphique en précisant l’unité ou le domaine concerné.',
    },
  ],
  quiz: quiz(row[0]),
  isFree: row[3],
  teacherId: index % 2 ? 'teacher-2' : 'teacher-1',
  subjectId: row[2] === 'math' ? 'math' : 'physics',
  chapterId: row[2] === 'math' ? index < 4 ? 'm1' : 'm2' : index === 8 ? 'p1' : 'p2',
  status: 'published' as const,
  order: index + 1,
  views: 0,
})

export const subjects: Subject[] = [
  {
    id: 'math',
    title: 'Mathématiques',
    titleFr: 'Mathématiques',
    color: 'indigo',
    icon: '∑',
    description: 'Une méthode claire et des exercices du Bac corrigés étape par étape.',
    chapters: [
      { id: 'm1', title: 'Fonctions et analyse', lessons: lessons.slice(0, 4).map((lesson, index) => makeLesson(index, lesson)) },
      { id: 'm2', title: 'Nombres et suites', lessons: lessons.slice(4, 8).map((lesson, index) => makeLesson(index + 4, lesson)) },
    ],
  },
  {
    id: 'physics',
    title: 'Physique',
    titleFr: 'Physique',
    color: 'cyan',
    icon: '⚛',
    description: 'Comprenez les lois physiques et appliquez-les avec confiance à l’examen.',
    chapters: [
      { id: 'p1', title: 'Mécanique', lessons: lessons.slice(8, 9).map((lesson, index) => makeLesson(index + 8, lesson)) },
      { id: 'p2', title: 'Électricité et ondes', lessons: lessons.slice(9).map((lesson, index) => makeLesson(index + 9, lesson)) },
    ],
  },
]

export const demoUsers: User[] = [
  { id: 'student-1', name: 'Amna Ayari', email: 'student@edubac.tn', phone: '22123456', section: 'Mathématiques', role: 'student' },
  { id: 'teacher-1', name: 'Meriem Ben Salah', email: 'teacher@edubac.tn', phone: '55123456', section: 'Mathématiques', role: 'teacher' },
  { id: 'admin-1', name: 'Administration', email: 'admin@edubac.tn', phone: '22111111', section: 'Mathématiques', role: 'admin' },
]

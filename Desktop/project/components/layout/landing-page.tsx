'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  ArrowRight, BookOpen, CheckCircle2, ClipboardCheck, GraduationCap,
  PlayCircle, ShieldCheck, Sparkles, Target, Video,
} from 'lucide-react'
import { useLanguage } from '@/components/shared/language-provider'
import * as api from '@/lib/api'
import type { PlatformSettings, Subject } from '@/types'
import { toast } from 'sonner'

const learningSteps = [
  { icon: BookOpen, title: 'Choisissez une matière', text: 'Retrouvez les cours organisés par matière et par chapitre.' },
  { icon: PlayCircle, title: 'Apprenez à votre rythme', text: 'Suivez le cours, consultez son résumé et travaillez les exercices.' },
  { icon: ClipboardCheck, title: 'Entraînez-vous au Bac', text: 'Testez vos connaissances et révisez avec les annales disponibles.' },
]

const platformFeatures = [
  { icon: GraduationCap, title: 'Cours structurés', text: 'Des contenus classés selon les matières et chapitres du Bac tunisien.' },
  { icon: CheckCircle2, title: 'Exercices corrigés', text: 'Mettez en pratique les notions avec des corrections et des explications.' },
  { icon: Video, title: 'Séances en direct', text: 'Retrouvez les séances et leurs replays lorsqu’ils sont proposés.' },
  { icon: ShieldCheck, title: 'Un espace personnel', text: 'Suivez votre progression, vos résultats et votre abonnement au même endroit.' },
]

const faqItems = [
  { question: 'Comment commencer à apprendre ?', answer: 'Créez un compte, choisissez une matière et ouvrez un cours gratuit depuis le catalogue.' },
  { question: 'Comment accéder aux cours payants ?', answer: 'Choisissez une formule, suivez les instructions de paiement et envoyez votre reçu. L’accès est activé après validation.' },
  { question: 'Puis-je suivre mes résultats ?', answer: 'Votre tableau de bord rassemble les leçons terminées, la progression par matière et les résultats des quiz.' },
  { question: 'Les séances en direct sont-elles toujours disponibles ?', answer: 'Les séances et leurs replays apparaissent lorsqu’un enseignant les a publiés. Les liens de réunion sont réservés aux abonnés actifs.' },
]

export function LandingPage() {
  const { t } = useLanguage()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [settings, setSettings] = useState<PlatformSettings>()

  useEffect(() => {
    void api.getSubjects().then(setSubjects).catch(() => toast.error(t('unknownError')))
    void api.getSettings().then(setSettings).catch(() => toast.error(t('unknownError')))
  }, [t])

  const monthlyPrice = settings?.monthlyPrice
  const plans = [
    { title: t('planMonthly'), total: monthlyPrice, duration: '1 mois' },
    { title: t('planQuarterly'), total: monthlyPrice === undefined ? undefined : monthlyPrice * 3, duration: '3 mois', featured: true },
    { title: t('planAnnual'), total: monthlyPrice === undefined ? undefined : monthlyPrice * 10, duration: '10 mois' },
  ]

  return <div className="landing-page">
    <section className="hero">
      <div className="hero-copy">
        <span className="hero-eyebrow"><Sparkles aria-hidden="true"/> Préparation au Baccalauréat tunisien</span>
        <h1>Apprenez avec méthode.<br/><span>Réussissez avec confiance.</span></h1>
        <p className="hero-desc">Des cours clairs, des exercices corrigés et les outils essentiels pour avancer à votre rythme vers le Bac.</p>
        <div className="hero-actions"><Link href="/register" className="button-primary">{t('start')} <ArrowRight aria-hidden="true"/></Link><Link href="/subjects" className="button-soft">{t('courses')}</Link></div>
        <div className="hero-trust"><span><CheckCircle2 aria-hidden="true"/> Programme du Bac tunisien</span><span><CheckCircle2 aria-hidden="true"/> Cours gratuits pour commencer</span></div>
      </div>
      <div className="hero-visual" aria-label="Aperçu de la plateforme">
        <div className="learning-preview">
          <div className="preview-topline"><span className="preview-icon"><BookOpen aria-hidden="true"/></span><span><strong>Votre espace d’apprentissage</strong><small>Les ressources pour votre prochaine étape</small></span><span className="preview-check"><CheckCircle2 aria-hidden="true"/></span></div>
          <div className="preview-lesson"><span className="preview-lesson-icon"><PlayCircle aria-hidden="true"/></span><span><strong>Un cours à la fois</strong><small>Résumé · Exercices · Quiz</small></span><ArrowRight aria-hidden="true"/></div>
          <div className="preview-subjects"><span>Mathématiques</span><span>Physique</span><span>Annales</span></div>
          <div className="preview-note"><ShieldCheck aria-hidden="true"/><span>Votre progression reste à portée de main.</span></div>
        </div>
        <div className="visual-orbit visual-orbit-one"/>
        <div className="visual-orbit visual-orbit-two"/>
      </div>
    </section>

    <section className="landing-section subjects-section" id="subjects">
      <div className="section-heading"><span className="section-kicker">Apprendre par matière</span><h2>Un parcours plus clair, chapitre après chapitre</h2><p>Choisissez votre matière et retrouvez les leçons au même endroit.</p></div>
      <div className="landing-subject-grid">{subjects.map((subject) => {
        const lessonCount = subject.chapters.reduce((count, chapter) => count + chapter.lessons.length, 0)
        const SubjectIcon = subject.id === 'physics' ? Target : BookOpen
        return <Link className={`landing-subject-card subject-${subject.id}`} href={`/subjects/${subject.id}`} key={subject.id}>
          <span className="subject-icon"><SubjectIcon aria-hidden="true"/></span><span className="subject-card-copy"><strong>{subject.titleFr}</strong><small>{subject.description}</small><span className="subject-count">{subject.chapters.length} chapitres · {lessonCount} cours</span></span><ArrowRight className="subject-arrow" aria-hidden="true"/>
        </Link>
      })}</div>
      <Link href="/subjects" className="text-link">Explorer toutes les matières <ArrowRight aria-hidden="true"/></Link>
    </section>

    <section className="landing-section steps-section">
      <div className="section-heading"><span className="section-kicker">Simple et progressif</span><h2>Trois étapes pour avancer</h2><p>Organisez votre révision avec des outils pensés pour le programme.</p></div>
      <div className="steps-grid">{learningSteps.map(({ icon: Icon, title, text }, index) => <article className="step-card" key={title}><span className="step-number">0{index + 1}</span><span className="step-icon"><Icon aria-hidden="true"/></span><h3>{title}</h3><p>{text}</p></article>)}</div>
    </section>

    <section className="landing-section features-section">
      <div className="section-heading"><span className="section-kicker">Les bons outils, au bon endroit</span><h2>Tout pour apprendre et vous entraîner</h2></div>
      <div className="feature-grid">{platformFeatures.map(({ icon: Icon, title, text }) => <article className="feature-card" key={title}><span className="feature-icon"><Icon aria-hidden="true"/></span><h3>{title}</h3><p>{text}</p></article>)}</div>
    </section>

    <section className="teacher-promo"><div><span className="section-kicker">Apprendre avec les enseignants</span><h2>Des contenus et des séances au fil de votre préparation</h2><p>Consultez les leçons publiées, révisez avec les annales et rejoignez les séances en direct disponibles.</p></div><Link href="/subjects" className="button-soft">{t('courses')} <ArrowRight aria-hidden="true"/></Link></section>

    <section className="landing-section pricing-section" id="pricing">
      <div className="section-heading"><span className="section-kicker">Des formules adaptées à votre rythme</span><h2>Choisissez votre durée d’abonnement</h2><p>Les tarifs à jour sont définis par la plateforme et visibles avant votre demande.</p></div>
      <div className="pricing-cards">{plans.map((plan) => <article className={`pricing-card${plan.featured ? ' pricing-card-featured' : ''}`} key={plan.title}>
        {plan.featured && <span className="pricing-featured-label">Formule suggérée</span>}
        <span className="pricing-duration">{plan.duration}</span><h3>{plan.title}</h3>
        <p className="pricing-amount">{plan.total === undefined ? '—' : <>{plan.total} <small>TND</small></>}</p>
        <p>Accès aux contenus réservés pendant la durée de la formule.</p>
        <Link href="/pricing" className={plan.featured ? 'button-primary' : 'button-soft'}>{t('pricing')} <ArrowRight aria-hidden="true"/></Link>
      </article>)}</div>
    </section>

    <section className="landing-section faq-section"><div className="section-heading"><span className="section-kicker">Besoin d’aide ?</span><h2>Questions fréquentes</h2></div><div className="faq-list">{faqItems.map(({ question, answer }) => <details className="faq-item" key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>

    <section className="final-cta"><div><span className="section-kicker">Votre prochaine étape commence ici</span><h2>Construisez une préparation qui vous ressemble.</h2><p>Créez votre espace et commencez par une matière.</p></div><Link href="/register" className="button-primary">{t('start')} <ArrowRight aria-hidden="true"/></Link></section>
  </div>
}

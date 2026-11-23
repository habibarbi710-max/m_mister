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
  { icon: BookOpen, title: 'Choisissez une classe', text: 'Trouvez un groupe selon votre filière et la matière à travailler.' },
  { icon: PlayCircle, title: 'Suivez les séances', text: 'Retrouvez les cours, les horaires et les annonces du professeur.' },
  { icon: ClipboardCheck, title: 'Suivez vos progrès', text: 'Consultez les devoirs, les présences et les notes dans votre dossier.' },
]

const platformFeatures = [
  { icon: GraduationCap, title: 'Cours structurés', text: 'Des contenus classés selon les matières et chapitres du Bac tunisien.' },
  { icon: CheckCircle2, title: 'Exercices corrigés', text: 'Mettez en pratique les notions avec des corrections et des explications.' },
  { icon: Video, title: 'Séances en direct', text: 'Retrouvez les séances hebdomadaires de vos classes.' },
  { icon: ShieldCheck, title: 'Un espace personnel', text: 'Suivez vos présences, vos devoirs, vos notes et votre progression.' },
]

const faqItems = [
  { question: 'Comment rejoindre une classe ?', answer: 'Choisissez votre filière, trouvez une classe et envoyez une demande au professeur.' },
  { question: 'Comment suivre mes résultats ?', answer: 'Mon dossier rassemble vos présences, le cahier de textes, les devoirs et les notes.' },
  { question: 'Qui fixe l’horaire des séances ?', answer: 'Le professeur propose plusieurs créneaux et fixe celui qui convient au groupe.' },
]

export function LandingPage() {
  const { t } = useLanguage()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [settings, setSettings] = useState<PlatformSettings>()

  useEffect(() => {
    void api.getSubjects().then(setSubjects).catch(() => toast.error(t('unknownError')))
    void api.getSettings().then(setSettings).catch(() => toast.error(t('unknownError')))
  }, [t])

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

    <section className="teacher-promo"><div><span className="section-kicker">Apprendre avec les enseignants</span><h2>Des classes organisées par filière</h2><p>Rejoignez un groupe, retrouvez ses cours, ses devoirs et ses séances.</p></div><Link href="/groups" className="button-soft">Trouver une classe <ArrowRight aria-hidden="true"/></Link></section>

    {settings?.paymentsEnabled ? <section className="landing-section pricing-section" id="pricing">
      <div className="section-heading"><span className="section-kicker">Tarifs par classe</span><h2>Consultez les conditions du groupe choisi</h2>
        <p>Chaque professeur définit le tarif mensuel de sa classe. Aucun abonnement global n’est proposé.</p></div>
      <Link href="/groups" className="button-primary">Voir les classes et leurs tarifs <ArrowRight aria-hidden="true"/></Link>
    </section> : <section className="landing-section pricing-section"><div className="section-heading">
      <span className="section-kicker">Classes du Bac tunisien</span><h2>Trouvez le groupe qui vous correspond</h2>
      <p>Les inscriptions sont gratuites pour le moment.</p></div>
      <Link href="/groups" className="button-primary">Découvrir les classes <ArrowRight aria-hidden="true"/></Link>
    </section>}

    <section className="landing-section faq-section"><div className="section-heading"><span className="section-kicker">Besoin d’aide ?</span><h2>Questions fréquentes</h2></div><div className="faq-list">{faqItems.map(({ question, answer }) => <details className="faq-item" key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>

    <section className="final-cta"><div><span className="section-kicker">Votre prochaine étape commence ici</span><h2>Construisez une préparation qui vous ressemble.</h2><p>Créez votre espace et commencez par une matière.</p></div><Link href="/register" className="button-primary">{t('start')} <ArrowRight aria-hidden="true"/></Link></section>
  </div>
}

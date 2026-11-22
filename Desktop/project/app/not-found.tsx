'use client'
import Link from 'next/link'
import { BookOpen, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return <main className="empty-page"><span className="heading-icon"><BookOpen /></span><h1>Page introuvable</h1><p>Le lien est incorrect ou la page a été déplacée.</p><Link className="button-primary" href="/">Retour à l’accueil <ArrowLeft /></Link></main>
}

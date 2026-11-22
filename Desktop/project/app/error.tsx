'use client'
import Link from 'next/link'
import { RefreshCw, TriangleAlert } from 'lucide-react'

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="empty-page"><span className="heading-icon heading-icon-error"><TriangleAlert /></span><h1>Une erreur inattendue s’est produite</h1><p>Votre progression est conservée. Réessayez ou retournez à l’accueil.</p><button className="button-primary" onClick={reset}>Réessayer <RefreshCw /></button><Link href="/" className="text-link error-home-link">Retour à l’accueil</Link></main>
}

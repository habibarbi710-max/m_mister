'use client'
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) { return <main className="empty-page"><h1>Impossible de charger le tableau de bord enseignant</h1><button className="button-primary" onClick={reset}>Réessayer</button></main> }

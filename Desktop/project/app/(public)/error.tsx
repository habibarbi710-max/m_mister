'use client'
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) { return <main className="empty-page"><h1>Une erreur s’est produite</h1><button className="button-primary" onClick={reset}>Réessayer</button></main> }

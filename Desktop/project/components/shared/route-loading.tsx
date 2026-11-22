export function RouteLoading() {
  return (
    <main className="route-loading" role="status" aria-label="Chargement en cours">
      <span className="skeleton-line loading-line-heading" aria-hidden="true" />
      <span className="skeleton-line loading-line-short" aria-hidden="true" />
      <span className="skeleton-video" aria-hidden="true" />
    </main>
  )
}

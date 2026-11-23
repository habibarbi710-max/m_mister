import type { LessonVideoProvider } from '@/types'

export type ParsedVideoUrl = {
  provider: LessonVideoProvider
  url: string
  playbackUrl: string
}

export type VideoUrlResult =
  | { ok: true; data: ParsedVideoUrl }
  | { ok: false; error: string }

const invalidVideoLink = 'Le lien vidéo est invalide ou privé. Vérifiez qu’il est accessible et utilisez une URL YouTube, Vimeo, Bunny ou MP4.'

export function parseVideoUrl(value: string): VideoUrlResult {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return { ok: false, error: invalidVideoLink }
  }
  if (url.protocol !== 'https:') return { ok: false, error: invalidVideoLink }

  const host = url.hostname.toLowerCase()
  const parts = url.pathname.split('/').filter(Boolean)

  if (url.pathname.toLowerCase().endsWith('.mp4')) {
    return { ok: true, data: { provider: 'mp4', url: url.toString(), playbackUrl: url.toString() } }
  }

  if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')
    || host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com')) {
    const id = host === 'youtu.be' ? parts[0]
      : url.searchParams.get('v') ?? url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1]
    if (!id || !/^[\w-]{6,}$/.test(id)) return { ok: false, error: invalidVideoLink }
    return {
      ok: true,
      data: { provider: 'youtube', url: url.toString(), playbackUrl: `https://www.youtube-nocookie.com/embed/${id}` },
    }
  }

  if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
    const id = url.pathname.match(/\/(\d+)(?:\/|$)/)?.[1]
    if (!id) return { ok: false, error: invalidVideoLink }
    return { ok: true, data: { provider: 'vimeo', url: url.toString(), playbackUrl: `https://player.vimeo.com/video/${id}` } }
  }

  if (host === 'iframe.mediadelivery.net' && parts[0] === 'embed' && parts.length >= 3) {
    return { ok: true, data: { provider: 'bunny', url: url.toString(), playbackUrl: url.toString() } }
  }

  if ((host === 'bunnycdn.com' || host.endsWith('.bunnycdn.com')
    || host === 'b-cdn.net' || host.endsWith('.b-cdn.net')) && parts.length > 0) {
    return { ok: true, data: { provider: 'bunny', url: url.toString(), playbackUrl: url.toString() } }
  }

  return { ok: false, error: invalidVideoLink }
}

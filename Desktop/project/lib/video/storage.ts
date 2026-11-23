import type { LessonVideo } from '@/types'
import { parseVideoUrl } from '@/lib/video/parse'

export interface VideoStorage {
  getPlaybackUrl(video: LessonVideo): string
  upload(file: File): Promise<never>
}

export const linkVideoStorage: VideoStorage = {
  getPlaybackUrl(video) {
    const parsed = parseVideoUrl(video.url)
    if (!parsed.ok) throw new Error(parsed.error)
    return parsed.data.playbackUrl
  },
  async upload() {
    throw new Error('Le téléversement vidéo nécessite un service de stockage externe.')
  },
}

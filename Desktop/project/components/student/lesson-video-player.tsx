'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import * as api from '@/lib/api'
import { linkVideoStorage } from '@/lib/video/storage'
import type { LessonVideo } from '@/types'
import { useLanguage } from '@/components/shared/language-provider'

export function LessonVideoPlayer({ lessonId, video }: { lessonId: string; video: LessonVideo }) {
  const { t } = useLanguage()
  const player = useRef<HTMLVideoElement>(null)
  const lastSaved = useRef(0)
  const [resumeAt, setResumeAt] = useState(0)
  const [speed, setSpeed] = useState(1)

  useEffect(() => {
    let active = true
    void api.getVideoPosition(video.id).then((position) => {
      if (active) setResumeAt(position?.seconds ?? 0)
    }).catch(() => toast.error(t('unknownError')))
    return () => { active = false }
  }, [t, video.id])

  function applyResume() {
    if (player.current && resumeAt > 0) {
      player.current.currentTime = resumeAt
      lastSaved.current = resumeAt
    }
  }

  async function savePosition(seconds: number) {
    const result = await api.saveVideoPosition(lessonId, video.id, seconds)
    if (!result.ok) toast.error(result.error)
  }

  function onTimeUpdate() {
    const seconds = player.current?.currentTime ?? 0
    if (seconds - lastSaved.current < 5 && seconds < video.durationSeconds * 0.9) return
    lastSaved.current = seconds
    void savePosition(seconds)
  }

  if (video.provider !== 'mp4') {
    return <iframe
      className="lesson-video"
      src={linkVideoStorage.getPlaybackUrl(video)}
      title={video.title}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
    />
  }

  return <div className="lesson-native-video">
    <video
      ref={player}
      className="lesson-video"
      src={linkVideoStorage.getPlaybackUrl(video)}
      controls
      playsInline
      onLoadedMetadata={applyResume}
      onTimeUpdate={onTimeUpdate}
      onEnded={() => void savePosition(player.current?.duration ?? 0)}
    />
    <label className="video-speed-control">
      {t('playbackSpeed')}
      <select value={speed} onChange={(event) => {
        const nextSpeed = Number(event.target.value)
        setSpeed(nextSpeed)
        if (player.current) player.current.playbackRate = nextSpeed
      }}>
        {[0.75, 1, 1.25, 1.5, 2].map((rate) => <option value={rate} key={rate}>{rate}×</option>)}
      </select>
    </label>
  </div>
}

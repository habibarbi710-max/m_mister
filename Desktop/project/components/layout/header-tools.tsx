'use client'

import Link from 'next/link'
import { Bell, Moon, Search, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import * as api from '@/lib/api'
import { useAuth } from '@/components/shared/auth-provider'
import { useLanguage } from '@/components/shared/language-provider'
import type { Lesson } from '@/types'
import type { Notification } from '@/lib/data/provider'

export function DarkModeToggle() {
  const { t } = useLanguage()
  const [dark, setDark] = useState(false)

  useEffect(() => {
    let active = true
    void api.getThemePreference().then((theme) => {
      if (active) setDark(theme === 'dark')
    }).catch(() => toast.error(t('unknownError')))
    return () => { active = false }
  }, [t])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  async function toggle() {
    const next = !dark
    setDark(next)
    try {
      await api.saveThemePreference(next ? 'dark' : 'light')
    } catch {
      toast.error(t('unknownError'))
    }
  }

  return <button className="header-tool-button" type="button" aria-label={dark ? t('switchToLight') : t('switchToDark')} aria-pressed={dark} onClick={() => void toggle()}>
    {dark ? <Sun aria-hidden="true"/> : <Moon aria-hidden="true"/>}
  </button>
}

export function GlobalLessonSearch() {
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Lesson[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const listId = 'lesson-search-results'

  useEffect(() => {
    const normalized = query.trim()
    if (normalized.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    let active = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      void api.searchLessons(normalized)
        .then((matches) => {
          if (active) {
            setResults(matches)
            setActiveIndex(-1)
          }
        })
        .catch(() => toast.error(t('unknownError')))
        .finally(() => { if (active) setLoading(false) })
    }, 180)
    return () => { active = false; window.clearTimeout(timer) }
  }, [query, t])

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && results.length) {
      event.preventDefault()
      const next = (activeIndex + 1) % results.length
      setActiveIndex(next)
      resultRefs.current[next]?.focus()
    } else if (event.key === 'ArrowUp' && results.length) {
      event.preventDefault()
      const next = activeIndex <= 0 ? results.length - 1 : activeIndex - 1
      setActiveIndex(next)
      resultRefs.current[next]?.focus()
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return <div className="global-search">
    <label className="sr-only" htmlFor="global-lesson-search">{t('searchLessons')}</label>
    <div className="global-search-input">
      <Search aria-hidden="true"/>
      <input
        ref={inputRef}
        id="global-lesson-search"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && query.trim().length >= 2}
        aria-controls={listId}
        aria-activedescendant={activeIndex >= 0 ? `lesson-result-${activeIndex}` : undefined}
        placeholder={t('searchLessons')}
        value={query}
        onChange={(event) => { setQuery(event.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.parentElement?.contains(event.relatedTarget)) setOpen(false)
        }}
      />
    </div>
    {open && query.trim().length >= 2 && <div className="global-search-results" id={listId} role="listbox" aria-label={t('searchResults')}>
      {loading ? <p role="status">{t('loading')}</p>
        : results.length ? results.map((lesson, index) => <Link
          id={`lesson-result-${index}`}
          role="option"
          aria-selected={activeIndex === index}
          key={lesson.id}
          href={`/lessons/${lesson.id}`}
          ref={(element) => { resultRefs.current[index] = element }}
          onClick={() => { setOpen(false); setQuery('') }}
        >{lesson.title}</Link>)
          : <p role="status">{t('noSearchResults')}</p>}
    </div>}
  </div>
}

export function NotificationBell() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])

  useEffect(() => {
    let active = true
    const refresh = () => {
      if (!user) {
        setNotifications([])
        return
      }
      void api.getNotifications().then((items) => {
        if (active) setNotifications(items)
      }).catch(() => toast.error(t('unknownError')))
    }
    refresh()
    const timer = window.setInterval(refresh, 30_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [t, user])

  const unread = notifications.filter((notification) => !notification.readAt).length
  async function markRead(notification: Notification) {
    if (notification.readAt) return
    const result = await api.markNotificationRead(notification.id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setNotifications((current) => current.map((item) => item.id === notification.id ? result.data : item))
  }

  async function markAllRead() {
    const result = await api.markAllNotificationsRead()
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    const readAt = new Date().toISOString()
    setNotifications((current) => current.map((item) => item.readAt ? item : { ...item, readAt }))
  }

  return <details className="notification-menu">
    <summary className="header-tool-button" aria-label={`${t('notifications')}${unread ? `, ${unread} ${t('unread')}` : ''}`}>
      <Bell aria-hidden="true"/>{unread > 0 && <span className="notification-count" aria-label={`${unread} ${t('unread')}`}>{unread > 9 ? '9+' : unread}</span>}
    </summary>
    <section className="notification-popover" aria-label={t('notifications')}>
      <div className="notification-popover-heading"><h2>{t('notifications')}</h2>{unread > 0 && <button type="button" onClick={() => void markAllRead()}>Tout lire</button>}</div>
      {notifications.length === 0 ? <p>{t('noNotifications')}</p> : <ul>{notifications.slice(0, 20).map((notification) => <li key={notification.id} className={notification.readAt ? '' : 'is-unread'}>
        <Link href={notification.href} onClick={() => void markRead(notification)}>
          <strong>{notification.title}</strong><span>{notification.message}</span><time dateTime={notification.createdAt}>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(notification.createdAt))}</time>
        </Link>
      </li>)}</ul>}
      <Link className="notification-center-link" href="/notifications">Voir toutes les notifications</Link>
    </section>
  </details>
}

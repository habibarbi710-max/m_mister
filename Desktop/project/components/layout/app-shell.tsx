'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { toast, Toaster } from 'sonner'
import { BookOpen, CalendarDays, ClipboardCheck, LayoutDashboard, LogOut, Menu, ShieldCheck, UserRound, Users, X } from 'lucide-react'
import { AuthForm } from '@/components/shared/auth-form'
import { useAuth } from '@/components/shared/auth-provider'
import { LanguageProvider, useLanguage } from '@/components/shared/language-provider'
import * as api from '@/lib/api'
import type { Subscription } from '@/types'
import { StudentDashboard } from '@/components/student/student-dashboard'
import { ExamList, LiveSessions, StudentLesson, SubjectCatalog, SubjectPage } from '@/components/student/student-catalog'
import { StudentProfile, SubscriptionPage } from '@/components/student/student-account'
import { TeacherDashboard } from '@/components/teacher/teacher-dashboard'
import { TeacherContentStudio } from '@/components/teacher/content-studio'
import { AdminDashboard } from '@/components/admin/admin-dashboard'
import { LandingPage } from '@/components/layout/landing-page'
import { RouteLoading } from '@/components/shared/route-loading'
import { matchesRoute } from '@/lib/route-matching'
import { LiveRoomPage } from '@/components/student/live-room-page'
import { DarkModeToggle, GlobalLessonSearch, NotificationBell } from '@/components/layout/header-tools'
import {
  AdminRelationshipsPage,
  HomeworkPage,
  MessagesPage,
  NotificationsPage,
  TeacherAnnouncementsPage,
  TeacherDirectory,
  TeacherPublicProfile,
  TeacherQuestionsInbox,
  TeacherStudentsPage,
} from '@/components/relationships/relationship-pages'
import {
  AdminGroupsPage,
  GroupDetailPage,
  GroupDirectory,
  StudentGroupsPage,
  StudentRecordPage,
  StudentSchedulePage,
  TeacherGroupsPage,
  TeacherSchedulePage,
} from '@/components/groups/group-pages'

export function AppShell() {
  return <LanguageProvider><ShellContent/></LanguageProvider>
}

function ShellContent() {
  const { t } = useLanguage()
  const { user, loading, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [paymentsEnabled, setPaymentsEnabled] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  useEffect(() => {
    void api.getSettings().then((settings) => setPaymentsEnabled(settings.paymentsEnabled === true))
      .catch(() => toast.error('Impossible de charger les paramètres de la plateforme.'))
  }, [])
  const liveRoom = pathname.startsWith('/live/')
  const teacherRoute = matchesRoute(pathname, '/teacher')
  const adminRoute = matchesRoute(pathname, '/admin')
  const protectedRole = useMemo(() => teacherRoute || adminRoute || pathname === '/dashboard' || pathname === '/profile' || pathname.startsWith('/student/') || pathname === '/messages' || pathname === '/notifications' || liveRoom, [adminRoute, liveRoom, pathname, teacherRoute])
  const studentArea = user?.role === 'student' && (pathname === '/dashboard' || pathname === '/subjects' || pathname.startsWith('/subjects/') || pathname.startsWith('/lessons/') || pathname === '/exams' || pathname === '/live' || liveRoom || pathname === '/profile' || pathname.startsWith('/student/') || pathname === '/groups' || pathname.startsWith('/groups/') || pathname === '/messages' || pathname === '/notifications')
  const teacherArea = user?.role === 'teacher' && (teacherRoute || liveRoom || pathname === '/messages' || pathname === '/notifications')
  const adminArea = user?.role === 'admin' && (adminRoute || pathname === '/notifications' || liveRoom)
  const workspace = Boolean(studentArea || teacherArea || adminArea)
  useEffect(() => {
    if (loading || !protectedRole) return
    if (!user) router.replace(`/login?return=${encodeURIComponent(pathname)}`)
    else if (adminRoute && user.role !== 'admin') router.replace(user.role === 'teacher' ? '/teacher' : '/dashboard')
    else if (liveRoom && user.role === 'admin') router.replace('/admin')
    else if (teacherRoute && user.role !== 'teacher' && user.role !== 'admin') router.replace('/dashboard')
    else if (pathname.startsWith('/student/') && user.role !== 'student') router.replace(user.role === 'admin' ? '/admin' : '/teacher')
    else if ((pathname === '/dashboard' || pathname === '/profile') && user.role !== 'student') router.replace(user.role === 'admin' ? '/admin' : '/teacher')
  }, [adminRoute, liveRoom, loading, pathname, protectedRole, router, teacherRoute, user])
  return <div dir="ltr" lang="fr" className={`site-shell min-h-screen bg-background text-foreground${workspace ? ' site-shell--workspace' : ''}${studentArea ? ' site-shell--student' : ''}${teacherArea ? ' site-shell--teacher' : ''}`}>
    <Toaster richColors position="top-center"/>
    <header className="site-header"><div className="header-inner">
      <Link href="/" className="brand"><span className="brand-mark">L</span><span>Learn With Me</span></Link>
      <nav id="primary-navigation" className={`main-nav ${menuOpen ? 'mobile-open' : ''}`} aria-label="Navigation principale">
        <Link href="/" onClick={() => setMenuOpen(false)}>{t('home')}</Link>
        <Link href="/groups" onClick={() => setMenuOpen(false)}>Trouver une classe</Link>
        <Link href="/subjects" onClick={() => setMenuOpen(false)}>{t('courses')}</Link>
        <Link href="/teachers" onClick={() => setMenuOpen(false)}>Professeurs</Link>
        <Link href="/exams" onClick={() => setMenuOpen(false)}>{t('exams')}</Link>
        <Link href="/live" onClick={() => setMenuOpen(false)}>{t('sessions')}</Link>
        {user?.role === 'student' && <Link href="/profile" onClick={() => setMenuOpen(false)}>{t('profile')}</Link>}
        {paymentsEnabled && <Link href="/pricing" onClick={() => setMenuOpen(false)}>{t('pricing')}</Link>}
        {user ? <><Link className="mobile-dashboard-link" href={user.role === 'admin' ? '/admin' : user.role === 'teacher' ? '/teacher' : '/dashboard'} onClick={() => setMenuOpen(false)}>{user.role === 'admin' ? t('adminHome') : user.role === 'teacher' ? t('teacherHome') : t('studentHome')}</Link><button className="mobile-logout-link" type="button" onClick={async () => { await logout(); router.push('/'); setMenuOpen(false) }}>{t('logout')}</button></> : <><Link className="mobile-auth-link" href="/login" onClick={() => setMenuOpen(false)}>{t('login')}</Link><Link className="mobile-auth-link" href="/register" onClick={() => setMenuOpen(false)}>{t('start')}</Link></>}
      </nav>
      <div className="header-actions">
        <GlobalLessonSearch/>
        {user && <NotificationBell/>}
        <DarkModeToggle/>
        {!workspace && <button className="menu-toggle" aria-expanded={menuOpen} aria-controls="primary-navigation" aria-label={t('courses')} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X aria-hidden="true"/> : <Menu aria-hidden="true"/>}</button>}
        {user ? <><Link href={user.role === 'admin' ? '/admin' : user.role === 'teacher' ? '/teacher' : '/dashboard'} className="header-cta">{user.role === 'admin' ? t('adminHome') : user.role === 'teacher' ? t('teacherHome') : t('studentHome')}</Link><button className="outline-button" aria-label={t('logout')} onClick={async () => { await logout(); router.push('/') }}><LogOut aria-hidden="true"/><span>{t('logout')}</span></button></> : <><Link className="header-login" href="/login">{t('login')}</Link><Link className="header-cta" href="/register">{t('start')}</Link></>}
      </div>
    </div></header>
    {workspace ? <div className={`workspace-frame${studentArea ? ' workspace-frame--student' : ''}${teacherArea ? ' workspace-frame--teacher' : ''}${adminArea ? ' workspace-frame--admin' : ''}`}>
      {studentArea && <StudentNavigation pathname={pathname}/>}
      {teacherArea && <TeacherNavigation pathname={pathname}/>}
      <div className="workspace-main">
        <WorkspaceTopbar role={studentArea ? 'student' : teacherArea ? 'teacher' : 'admin'} pathname={pathname}/>
        <main className="workspace-content">{loading && protectedRole ? <RouteLoading /> : <RouteContent pathname={pathname}/>}</main>
      </div>
      {studentArea && <StudentNavigation pathname={pathname} mobile/>}
    </div> : <main>{loading && protectedRole ? <RouteLoading /> : <RouteContent pathname={pathname}/>}</main>}
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-intro">
          <Link href="/" className="footer-brand"><span className="brand-mark">L</span><span>Learn With Me</span></Link>
          <p className="footer-description">Des cours, des exercices et des outils pour préparer le Baccalauréat tunisien avec méthode.</p>
        </div>
        <nav className="footer-link-group" aria-label="Explorer">
          <strong>Explorer</strong>
          <Link href="/subjects">{t('courses')}</Link>
          <Link href="/exams">{t('exams')}</Link>
          <Link href="/live">{t('sessions')}</Link>
        </nav>
        <nav className="footer-link-group" aria-label="Votre compte">
          <strong>Votre compte</strong>
          <Link href="/login">{t('login')}</Link>
          <Link href="/register">{t('register')}</Link>
          {paymentsEnabled && <Link href="/pricing">{t('pricing')}</Link>}
        </nav>
      </div>
      <div className="footer-bottom"><span>© {new Date().getFullYear()} Learn With Me</span><span>Préparez le Bac à votre rythme.</span></div>
    </footer>
  </div>
}

const studentLinks = [
  { href: '/dashboard', key: 'studentHome', icon: LayoutDashboard },
  { href: '/student/groups', key: 'studentHome', label: 'Mes classes', icon: Users },
  { href: '/subjects', key: 'courses', icon: BookOpen },
  { href: '/student/schedule', key: 'sessions', label: 'Emploi du temps', icon: CalendarDays },
  { href: '/student/record', key: 'profile', label: 'Mon dossier', icon: ClipboardCheck },
] as const

function StudentNavigation({ pathname, mobile = false }: { pathname: string; mobile?: boolean }) {
  const { t } = useLanguage()
  const selected = pathname.startsWith('/subjects') || pathname.startsWith('/lessons/') ? '/subjects'
    : pathname.startsWith('/student/groups') || pathname.startsWith('/groups') ? '/student/groups'
      : pathname.startsWith('/student/schedule') || pathname.startsWith('/live') ? '/student/schedule'
        : pathname.startsWith('/student/record') ? '/student/record'
          : pathname.startsWith('/profile') ? '/profile' : '/dashboard'
  return <nav className={mobile ? 'student-bottom-nav' : 'student-sidebar'} aria-label={mobile ? 'Navigation mobile' : 'Navigation étudiant'}>
    {!mobile && <p className="workspace-nav-label">Mon apprentissage</p>}
    {studentLinks.map((item) => {
      const { href, key, icon: Icon } = item
      const label = 'label' in item ? item.label : t(key)
      return <Link className={selected === href ? 'workspace-nav-link active' : 'workspace-nav-link'} href={href} key={href} aria-current={selected === href ? 'page' : undefined}><Icon aria-hidden="true"/><span>{label}</span></Link>
    })}
  </nav>
}

function TeacherNavigation({ pathname }: { pathname: string }) {
  const { t } = useLanguage()
  return <aside className="teacher-sidebar">
    <p className="workspace-nav-label">{t('teacherHome')}</p>
    <Link className={pathname === '/teacher' ? 'workspace-nav-link active' : 'workspace-nav-link'} href="/teacher"><LayoutDashboard aria-hidden="true"/><span>{t('dashboard')}</span></Link>
    <Link className={pathname.startsWith('/teacher/content') ? 'workspace-nav-link active' : 'workspace-nav-link'} href="/teacher/content"><BookOpen aria-hidden="true"/><span>{t('contentStudio')}</span></Link>
    <Link className={pathname.startsWith('/teacher/groups') ? 'workspace-nav-link active' : 'workspace-nav-link'} href="/teacher/groups"><Users aria-hidden="true"/><span>Mes groupes</span></Link>
    <Link className={pathname.startsWith('/teacher/schedule') ? 'workspace-nav-link active' : 'workspace-nav-link'} href="/teacher/schedule"><CalendarDays aria-hidden="true"/><span>Emploi du temps</span></Link>
    <Link className={pathname === '/teacher/students' ? 'workspace-nav-link active' : 'workspace-nav-link'} href="/teacher/students"><UserRound aria-hidden="true"/><span>Mes élèves</span></Link>
    <Link className={pathname === '/teacher/questions' ? 'workspace-nav-link active' : 'workspace-nav-link'} href="/teacher/questions"><ClipboardCheck aria-hidden="true"/><span>Questions</span></Link>
    <Link className={pathname === '/teacher/homework' ? 'workspace-nav-link active' : 'workspace-nav-link'} href="/teacher/homework"><BookOpen aria-hidden="true"/><span>Devoirs à corriger</span></Link>
    <Link className={pathname === '/teacher/announcements' ? 'workspace-nav-link active' : 'workspace-nav-link'} href="/teacher/announcements"><CalendarDays aria-hidden="true"/><span>Annonces</span></Link>
    <Link className={pathname === '/messages' ? 'workspace-nav-link active' : 'workspace-nav-link'} href="/messages"><UserRound aria-hidden="true"/><span>Messages</span></Link>
    <a className="workspace-nav-link" href="/teacher#sessions"><CalendarDays aria-hidden="true"/><span>{t('sessions')}</span></a>
    <a className="workspace-nav-link" href="/teacher#exams"><ClipboardCheck aria-hidden="true"/><span>{t('exams')}</span></a>
  </aside>
}

function WorkspaceTopbar({ role, pathname }: { role: 'student' | 'teacher' | 'admin'; pathname: string }) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [subscription, setSubscription] = useState<Subscription>({ status: 'None' })
  const [lastViewed, setLastViewed] = useState<string | null>(null)
  const [paymentsEnabled, setPaymentsEnabled] = useState(false)
  useEffect(() => {
    if (role !== 'student') return
    void Promise.all([api.getSettings(), api.getLastViewedLesson()])
      .then(async ([settings, lessonId]) => {
        setPaymentsEnabled(settings.paymentsEnabled === true)
        setLastViewed(lessonId)
        if (settings.paymentsEnabled) setSubscription(await api.getSubscription())
      })
      .catch(() => toast.error(t('unknownError')))
  }, [role, t, pathname])
  const sectionName = pathname.startsWith('/subjects') ? t('courses')
    : pathname.startsWith('/lessons') ? t('courses')
      : pathname === '/exams' ? t('exams')
        : pathname.startsWith('/live') ? t('sessions')
          : pathname === '/profile' ? t('profile')
            : pathname.startsWith('/teacher/students') ? 'Mes élèves'
              : pathname.startsWith('/teacher/questions') ? 'Questions'
                : pathname.startsWith('/teacher/homework') || pathname === '/student/homework' ? 'Devoirs'
                  : pathname === '/messages' ? 'Messages'
                    : pathname === '/notifications' ? 'Notifications'
                      : pathname.startsWith('/teacher/groups') || pathname.startsWith('/admin/groups') ? 'Groupes et classes'
                        : pathname.endsWith('/schedule') ? 'Emploi du temps'
                          : pathname.endsWith('/record') ? 'Mon dossier'
                            : pathname.endsWith('/groups') ? 'Mes classes'
                      : pathname === '/teacher/announcements' ? 'Annonces'
            : role === 'teacher' ? t('teacherHome')
              : role === 'admin' ? t('adminHome') : t('studentHome')
  const roleName = role === 'student' ? t('studentHome') : role === 'teacher' ? t('teacherHome') : t('adminHome')
  return <div className="workspace-topbar">
    <div className="workspace-breadcrumb"><span>{roleName}</span><span aria-hidden="true">/</span><strong>{sectionName}</strong></div>
    <div className="workspace-user">{role === 'student' && lastViewed && <Link className="resume-shortcut" href={`/lessons/${lastViewed}`}>{t('resumeLearning')}</Link>}<span className="workspace-user-name">{user?.name}</span>{role === 'student' && paymentsEnabled && <span className={`subscription-badge ${subscription.status === 'Active' ? 'is-active' : ''}`}><ShieldCheck aria-hidden="true"/>{subscription.status === 'Active' ? t('approved') : t('locked')}</span>}</div>
  </div>
}

function RouteContent({ pathname }: { pathname: string }) {
  const { t } = useLanguage()
  const { user } = useAuth()
  if (pathname === '/login' || pathname === '/register') return <AuthForm mode={pathname === '/login' ? 'login' : 'register'}/>
  if (pathname === '/') return <LandingPage/>
  if (pathname === '/pricing') return <SubscriptionPage/>
  if (pathname === '/teachers') return <TeacherDirectory/>
  if (pathname.startsWith('/teachers/')) return <TeacherPublicProfile teacherId={pathname.split('/')[2]}/>
  if (pathname === '/groups') return <GroupDirectory/>
  if (pathname.startsWith('/groups/')) return <GroupDetailPage groupId={pathname.split('/')[2]}/>
  if (pathname === '/student/groups' && user?.role === 'student') return <StudentGroupsPage/>
  if (pathname === '/student/schedule' && user?.role === 'student') return <StudentSchedulePage/>
  if (pathname === '/student/record' && user?.role === 'student') return <StudentRecordPage/>
  if (pathname === '/teacher/groups' && user?.role === 'teacher') return <TeacherGroupsPage/>
  if (pathname === '/teacher/schedule' && user?.role === 'teacher') return <TeacherSchedulePage/>
  if (pathname === '/admin/groups' && user?.role === 'admin') return <AdminGroupsPage/>
  if (pathname === '/messages' && user && user.role !== 'admin') return <MessagesPage/>
  if (pathname === '/notifications' && user) return <NotificationsPage/>
  if (pathname === '/student/homework' && user?.role === 'student') return <HomeworkPage/>
  if (pathname === '/teacher/students' && user?.role === 'teacher') return <TeacherStudentsPage/>
  if (pathname === '/teacher/questions' && user?.role === 'teacher') return <TeacherQuestionsInbox/>
  if (pathname === '/teacher/homework' && user?.role === 'teacher') return <HomeworkPage/>
  if (pathname === '/teacher/announcements' && user?.role === 'teacher') return <TeacherAnnouncementsPage/>
  if (pathname === '/admin/moderation' && user?.role === 'admin') return <AdminRelationshipsPage/>
  if (pathname === '/subjects') return <SubjectCatalog/>
  if (pathname.startsWith('/subjects/')) return <SubjectPage id={pathname.split('/')[2]}/>
  if (pathname.startsWith('/lessons/')) return <StudentLesson id={pathname.split('/')[2]}/>
  if (pathname === '/dashboard' && user) return <StudentDashboard user={user}/>
  if (pathname === '/exams') return <ExamList/>
  if (pathname.startsWith('/live/')) return <LiveRoomPage id={pathname.split('/')[2]}/>
  if (pathname === '/live') return <LiveSessions/>
  if (pathname === '/profile' && user) return <StudentProfile/>
  if (pathname === '/teacher/content' && (user?.role === 'teacher' || user?.role === 'admin')) return <TeacherContentStudio/>
  if (matchesRoute(pathname, '/teacher') && (user?.role === 'teacher' || user?.role === 'admin')) return <TeacherDashboard/>
  if (matchesRoute(pathname, '/admin') && user?.role === 'admin') return <AdminDashboard/>
  return <section className="empty-page"><h1>{t(user ? 'noPermission' : 'loginRequired')}</h1><Link href={user ? '/' : '/login'}>{user ? t('returnHome') : t('login')}</Link></section>
}

'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { toast, Toaster } from 'sonner'
import { BookOpen, CalendarDays, ClipboardCheck, LayoutDashboard, LogOut, Menu, ShieldCheck, UserRound, X } from 'lucide-react'
import { AuthForm } from '@/components/shared/auth-form'
import { useAuth } from '@/components/shared/auth-provider'
import { LanguageProvider, useLanguage } from '@/components/shared/language-provider'
import * as api from '@/lib/api'
import type { Subscription } from '@/types'
import { StudentDashboard } from '@/components/student/student-dashboard'
import { ExamList, LiveSessions, StudentLesson, SubjectCatalog, SubjectPage } from '@/components/student/student-catalog'
import { StudentProfile, SubscriptionPage } from '@/components/student/student-account'
import { TeacherDashboard } from '@/components/teacher/teacher-dashboard'
import { AdminDashboard } from '@/components/admin/admin-dashboard'
import { LandingPage } from '@/components/layout/landing-page'
import { RouteLoading } from '@/components/shared/route-loading'

export function AppShell() {
  return <LanguageProvider><ShellContent/></LanguageProvider>
}

function ShellContent() {
  const { t } = useLanguage()
  const { user, loading, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const protectedRole = useMemo(() => pathname.startsWith('/teacher') || pathname.startsWith('/admin') || pathname === '/dashboard' || pathname === '/profile', [pathname])
  const studentArea = user?.role === 'student' && (pathname === '/dashboard' || pathname === '/subjects' || pathname.startsWith('/subjects/') || pathname.startsWith('/lessons/') || pathname === '/exams' || pathname === '/live' || pathname === '/profile')
  const teacherArea = user?.role === 'teacher' && pathname.startsWith('/teacher')
  const adminArea = user?.role === 'admin' && pathname.startsWith('/admin')
  const workspace = Boolean(studentArea || teacherArea || adminArea)
  useEffect(() => {
    if (loading || !protectedRole) return
    if (!user) router.replace(`/login?return=${encodeURIComponent(pathname)}`)
    else if (pathname.startsWith('/admin') && user.role !== 'admin') router.replace(user.role === 'teacher' ? '/teacher' : '/dashboard')
    else if (pathname.startsWith('/teacher') && user.role !== 'teacher' && user.role !== 'admin') router.replace('/dashboard')
    else if ((pathname === '/dashboard' || pathname === '/profile') && user.role !== 'student') router.replace(user.role === 'admin' ? '/admin' : '/teacher')
  }, [loading, pathname, protectedRole, router, user])
  return <div dir="ltr" lang="fr" className={`site-shell min-h-screen bg-background text-foreground${workspace ? ' site-shell--workspace' : ''}${studentArea ? ' site-shell--student' : ''}${teacherArea ? ' site-shell--teacher' : ''}`}>
    <Toaster richColors position="top-center"/>
    <header className="site-header"><div className="header-inner">
      <Link href="/" className="brand"><span className="brand-mark">L</span><span>Learn With Me</span></Link>
      <nav id="primary-navigation" className={`main-nav ${menuOpen ? 'mobile-open' : ''}`} aria-label="Navigation principale"><Link href="/" onClick={() => setMenuOpen(false)}>{t('home')}</Link><Link href="/subjects" onClick={() => setMenuOpen(false)}>{t('courses')}</Link><Link href="/exams" onClick={() => setMenuOpen(false)}>{t('exams')}</Link><Link href="/live" onClick={() => setMenuOpen(false)}>{t('sessions')}</Link><Link href="/pricing" onClick={() => setMenuOpen(false)}>{t('pricing')}</Link>{user && <Link className="mobile-dashboard-link" href={user.role === 'admin' ? '/admin' : user.role === 'teacher' ? '/teacher' : '/dashboard'} onClick={() => setMenuOpen(false)}>{user.role === 'admin' ? t('adminHome') : user.role === 'teacher' ? t('teacherHome') : t('studentHome')}</Link>}</nav>
      <div className="header-actions">
        {!workspace && <button className="menu-toggle" aria-expanded={menuOpen} aria-controls="primary-navigation" aria-label={t('courses')} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X aria-hidden="true"/> : <Menu aria-hidden="true"/>}</button>}
        {user ? <><Link href={user.role === 'admin' ? '/admin' : user.role === 'teacher' ? '/teacher' : '/dashboard'} className="header-cta">{user.role === 'admin' ? t('adminHome') : user.role === 'teacher' ? t('teacherHome') : t('studentHome')}</Link><button className="outline-button" aria-label={t('logout')} onClick={async () => { await logout(); router.push('/') }}><LogOut aria-hidden="true"/><span>{t('logout')}</span></button></> : <><Link className="header-login" href="/login">{t('login')}</Link><Link className="header-cta" href="/register">{t('start')}</Link></>}
      </div>
    </div></header>
    {workspace ? <div className={`workspace-frame${studentArea ? ' workspace-frame--student' : ''}${teacherArea ? ' workspace-frame--teacher' : ''}${adminArea ? ' workspace-frame--admin' : ''}`}>
      {studentArea && <StudentNavigation pathname={pathname}/>}
      {teacherArea && <TeacherNavigation/>}
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
          <Link href="/pricing">{t('pricing')}</Link>
        </nav>
      </div>
      <div className="footer-bottom"><span>© {new Date().getFullYear()} Learn With Me</span><span>Préparez le Bac à votre rythme.</span></div>
    </footer>
  </div>
}

const studentLinks = [
  { href: '/dashboard', key: 'studentHome', icon: LayoutDashboard },
  { href: '/subjects', key: 'courses', icon: BookOpen },
  { href: '/exams', key: 'exams', icon: ClipboardCheck },
  { href: '/live', key: 'sessions', icon: CalendarDays },
  { href: '/profile', key: 'profile', icon: UserRound },
] as const

function StudentNavigation({ pathname, mobile = false }: { pathname: string; mobile?: boolean }) {
  const { t } = useLanguage()
  const selected = pathname.startsWith('/subjects') || pathname.startsWith('/lessons/') ? '/subjects'
    : pathname.startsWith('/profile') ? '/profile'
      : pathname.startsWith('/exams') ? '/exams'
        : pathname.startsWith('/live') ? '/live' : '/dashboard'
  return <nav className={mobile ? 'student-bottom-nav' : 'student-sidebar'} aria-label={mobile ? 'Navigation mobile' : 'Navigation étudiant'}>
    {!mobile && <p className="workspace-nav-label">Mon apprentissage</p>}
    {studentLinks.map(({ href, key, icon: Icon }) => <Link className={selected === href ? 'workspace-nav-link active' : 'workspace-nav-link'} href={href} key={href} aria-current={selected === href ? 'page' : undefined}><Icon aria-hidden="true"/><span>{t(key)}</span></Link>)}
  </nav>
}

function TeacherNavigation() {
  const { t } = useLanguage()
  return <aside className="teacher-sidebar">
    <p className="workspace-nav-label">{t('teacherHome')}</p>
    <Link className="workspace-nav-link active" href="/teacher"><LayoutDashboard aria-hidden="true"/><span>{t('dashboard')}</span></Link>
    <a className="workspace-nav-link" href="/teacher#lessons"><BookOpen aria-hidden="true"/><span>{t('courses')}</span></a>
    <a className="workspace-nav-link" href="/teacher#sessions"><CalendarDays aria-hidden="true"/><span>{t('sessions')}</span></a>
    <a className="workspace-nav-link" href="/teacher#exams"><ClipboardCheck aria-hidden="true"/><span>{t('exams')}</span></a>
  </aside>
}

function WorkspaceTopbar({ role, pathname }: { role: 'student' | 'teacher' | 'admin'; pathname: string }) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [subscription, setSubscription] = useState<Subscription>({ status: 'None' })
  useEffect(() => {
    if (role !== 'student') return
    void api.getSubscription().then(setSubscription).catch(() => toast.error(t('unknownError')))
  }, [role, t])
  const sectionName = pathname.startsWith('/subjects') ? t('courses')
    : pathname.startsWith('/lessons') ? t('courses')
      : pathname === '/exams' ? t('exams')
        : pathname === '/live' ? t('sessions')
          : pathname === '/profile' ? t('profile')
            : role === 'teacher' ? t('teacherHome')
              : role === 'admin' ? t('adminHome') : t('studentHome')
  const roleName = role === 'student' ? t('studentHome') : role === 'teacher' ? t('teacherHome') : t('adminHome')
  return <div className="workspace-topbar">
    <div className="workspace-breadcrumb"><span>{roleName}</span><span aria-hidden="true">/</span><strong>{sectionName}</strong></div>
    <div className="workspace-user"><span className="workspace-user-name">{user?.name}</span>{role === 'student' && <span className={`subscription-badge ${subscription.status === 'Active' ? 'is-active' : ''}`}><ShieldCheck aria-hidden="true"/>{subscription.status === 'Active' ? t('approved') : t('locked')}</span>}</div>
  </div>
}

function RouteContent({ pathname }: { pathname: string }) {
  const { t } = useLanguage()
  const { user } = useAuth()
  if (pathname === '/login' || pathname === '/register') return <AuthForm mode={pathname === '/login' ? 'login' : 'register'}/>
  if (pathname === '/') return <LandingPage/>
  if (pathname === '/pricing') return <SubscriptionPage/>
  if (pathname === '/subjects') return <SubjectCatalog/>
  if (pathname.startsWith('/subjects/')) return <SubjectPage id={pathname.split('/')[2]}/>
  if (pathname.startsWith('/lessons/')) return <StudentLesson id={pathname.split('/')[2]}/>
  if (pathname === '/dashboard' && user) return <StudentDashboard user={user}/>
  if (pathname === '/exams') return <ExamList/>
  if (pathname === '/live') return <LiveSessions/>
  if (pathname === '/profile' && user) return <StudentProfile/>
  if (pathname.startsWith('/teacher') && (user?.role === 'teacher' || user?.role === 'admin')) return <TeacherDashboard/>
  if (pathname.startsWith('/admin') && user?.role === 'admin') return <AdminDashboard/>
  return <section className="empty-page"><h1>{t(user ? 'noPermission' : 'loginRequired')}</h1><Link href={user ? '/' : '/login'}>{user ? t('returnHome') : t('login')}</Link></section>
}

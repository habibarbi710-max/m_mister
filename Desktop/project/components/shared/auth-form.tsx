'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'
import { BookOpenCheck, GraduationCap, ShieldCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import type { Section, User } from '@/types'
import { authLogin, authRegister } from '@/lib/auth'
import { useAuth } from './auth-provider'
import { useLanguage } from './language-provider'

const sections: Section[] = ['Mathématiques', 'Sciences expérimentales', 'Technique', 'Informatique']
const sectionTranslationKeys = ['sectionMath', 'sectionScience', 'sectionTechnical', 'sectionComputerScience'] as const
type FormValues = { name?: string; identifier: string; password: string; section: Section }

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const { t } = useLanguage()
  const { setUser } = useAuth()
  const router = useRouter()
  const [serverError, setServerError] = useState('')
  const schema = z.object({
    name: z.string().trim().optional(),
    identifier: z.string().trim().min(1, t('required')),
    password: z.string().min(8, t('passwordLength')),
    section: z.enum(['Mathématiques', 'Sciences expérimentales', 'Technique', 'Informatique']),
  }).superRefine((values, context) => {
    if (mode === 'register' && (values.name?.length ?? 0) < 2) context.addIssue({ code: 'custom', path: ['name'], message: t('nameLength') })
    if (mode === 'register' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.identifier) && !/^\+?[\d\s()-]{8,}$/.test(values.identifier)) {
      context.addIssue({ code: 'custom', path: ['identifier'], message: t('identifierInvalid') })
    }
  })
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: '', password: '', section: sections[0] },
  })

  async function submit(values: FormValues) {
    setServerError('')
    try {
      const result = mode === 'login'
        ? await authLogin(values.identifier, values.password)
        : await authRegister({
          name: values.name ?? '', email: values.identifier.includes('@') ? values.identifier : '',
          phone: values.identifier.includes('@') ? '' : values.identifier,
          password: values.password, section: values.section,
        })
      if (!result.ok) {
        const message = result.error === 'Email or password is incorrect' ? t('loginError')
          : result.error === 'This email is already registered' || result.error === 'This email or phone is already registered' ? t('emailExists')
            : result.error === 'This account is blocked' ? t('accountBlocked') : t('unknownError')
        setServerError(message)
        toast.error(message)
        return
      }
      setUser(result.data)
      toast.success(mode === 'login' ? t('loginSuccess') : t('registerSuccess'))
      const returnUrl = new URLSearchParams(window.location.search).get('return')
      router.replace(returnUrl?.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/dashboard')
    } catch {
      setServerError(t('unknownError'))
      toast.error(t('unknownError'))
    }
  }

  return (
    <section className="app-page auth-page">
      <div className="auth-layout">
        <aside className="auth-brand-panel"><span className="auth-brand-mark"><GraduationCap aria-hidden="true"/></span><p className="section-kicker">Learn With Me</p><h2>Votre préparation au Bac, plus claire.</h2><p>Un espace pour retrouver vos cours, vos exercices et votre progression.</p><div className="auth-benefits"><span><BookOpenCheck aria-hidden="true"/> Leçons organisées par matière</span><span><ShieldCheck aria-hidden="true"/> Espace personnel de révision</span></div></aside>
      <form className="auth-form-card" onSubmit={handleSubmit(submit)} noValidate>
        <h1>{mode === 'login' ? t('login') : t('register')}</h1>
        {mode === 'register' && <Field label={t('name')} error={errors.name?.message}><input {...register('name')} autoComplete="name" /></Field>}
        <Field label={mode === 'register' ? t('emailOrPhone') : t('emailOrPhone')} error={errors.identifier?.message}><input {...register('identifier')} autoComplete="username" /></Field>
        <Field label={t('password')} error={errors.password?.message}><input {...register('password')} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></Field>
        {mode === 'register' && <Field label={t('section')} error={errors.section?.message}><select {...register('section')}>{sections.map((section, index) => <option key={section} value={section}>{t(sectionTranslationKeys[index])}</option>)}</select></Field>}
        {serverError && <p role="alert">{serverError}</p>}
        <button className="button-primary" disabled={isSubmitting}>{isSubmitting ? t('loading') : t('submit')}</button>
        <p><Link href={mode === 'login' ? '/register' : '/login'}>{mode === 'login' ? t('register') : t('login')}</Link></p>
      </form>
      </div>
    </section>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className="form-field">{label}{children}{error && <small role="alert">{error}</small>}</label>
}

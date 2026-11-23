'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { CreditCard } from 'lucide-react'
import type { BacSection, User } from '@/types'
import * as api from '@/lib/api'
import { authChangePassword } from '@/lib/auth'
import { useAuth } from '@/components/shared/auth-provider'
import { useLanguage } from '@/components/shared/language-provider'
import { translateApiError } from '@/components/shared/api-error'

export function StudentProfile() {
  const { t } = useLanguage()
  const { user, setUser } = useAuth()
  const [sections, setSections] = useState<BacSection[]>([])
  const schema = useMemo(() => z.object({
    name: z.string().trim().min(2, t('nameLength')),
    phone: z.string().trim().regex(/^\+?[\d\s()-]{8,}$/, t('identifierInvalid')),
    section: z.string().trim().min(1, t('required')),
    currentPassword: z.string().optional(),
    newPassword: z.string().optional(),
  }).refine((value) => !value.newPassword || Boolean(value.currentPassword), { path: ['currentPassword'], message: t('required') })
    .refine((value) => !value.newPassword || value.newPassword.length >= 8, { path: ['newPassword'], message: t('passwordLength') }), [t])
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: user?.name ?? '', phone: user?.phone ?? '', section: user?.section ?? 'Mathématiques', currentPassword: '', newPassword: '' },
  })
  useEffect(() => {
    if (user) reset({ name: user.name, phone: user.phone, section: user.section, currentPassword: '', newPassword: '' })
  }, [reset, user])
  useEffect(() => {
    void api.listSections().then(setSections).catch(() => toast.error(t('unknownError')))
  }, [t])
  async function submit(values: { name: string; phone: string; section: User['section']; currentPassword?: string; newPassword?: string }) {
    if (!user) return
    try {
      if (values.newPassword) {
        const passwordResult = await authChangePassword(values.currentPassword ?? '', values.newPassword)
        if (!passwordResult.ok) {
          toast.error(translateApiError(passwordResult.error, t))
          return
        }
      }
      const updated = await api.updateProfile({
        ...user, name: values.name, phone: values.phone, section: values.section,
        sectionId: sections.find((section) => section.name === values.section)?.id,
      })
      setUser(updated)
      toast.success(t('profileSaved'))
    } catch {
      toast.error(t('unknownError'))
    }
  }
  return <section className="app-page"><header className="page-heading"><div><p className="section-kicker">Votre espace</p><h1>{t('profile')}</h1><p>Gérez vos informations et mettez à jour votre mot de passe.</p></div></header><form className="profile-form" onSubmit={handleSubmit(submit)} noValidate>
    <Field label={t('name')} error={errors.name?.message}><input {...register('name')}/></Field>
    <Field label={t('phone')} error={errors.phone?.message}><input {...register('phone')} inputMode="tel"/></Field>
    <Field label={t('section')} error={errors.section?.message}><select {...register('section')}>{!sections.some((section) => section.name === user?.section) && user?.section && <option value={user.section}>{user.section}</option>}{sections.map((section) => <option value={section.name} key={section.id}>{section.name}</option>)}</select></Field>
    <Field label={t('currentPassword')} error={errors.currentPassword?.message}><input {...register('currentPassword')} type="password"/></Field>
    <Field label={t('newPassword')} error={errors.newPassword?.message}><input {...register('newPassword')} type="password"/></Field>
    <button className="button-primary" disabled={isSubmitting}>{isSubmitting ? t('loading') : t('save')}</button>
  </form></section>
}

export function SubscriptionPage() {
  const { t } = useLanguage()
  const [paymentRows, setPaymentRows] = useState<Awaited<ReturnType<typeof api.getMyPayments>>>([])
  const [instructions, setInstructions] = useState('')
  const [monthlyPrice, setMonthlyPrice] = useState(12)
  const [paymentsEnabled, setPaymentsEnabled] = useState(false)
  const [pricingScope, setPricingScope] = useState<'group' | 'teacher' | 'platform'>('group')
  const [receipt, setReceipt] = useState<File>()
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'quarterly' | 'annual'>('quarterly')
  const [saving, setSaving] = useState(false)
  const schema = useMemo(() => z.object({ plan: z.enum(['monthly', 'quarterly', 'annual']), receipt: z.custom<File>((value) => value instanceof File, t('receiptInvalid')).refine((file) => file.size <= 3 * 1024 * 1024, t('receiptInvalid')).refine((file) => ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.type), t('receiptInvalid')) }), [t])
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<{ plan: 'monthly' | 'quarterly' | 'annual'; receipt: File }>({ resolver: zodResolver(schema), defaultValues: { plan: 'quarterly' } })
  useEffect(() => {
    void Promise.all([api.getMyPayments(), api.getSettings()]).then(([rows, settings]) => {
      setPaymentRows(rows)
      setInstructions(settings.paymentInstructions)
      setMonthlyPrice(settings.monthlyPrice)
      setPaymentsEnabled(settings.paymentsEnabled === true)
      setPricingScope(settings.pricingScope ?? 'group')
    })
  }, [])
  const plans = { monthly: monthlyPrice, quarterly: monthlyPrice * 3, annual: monthlyPrice * 10 }
  async function submit(values: { plan: 'monthly' | 'quarterly' | 'annual'; receipt: File }) {
    setSaving(true)
    try {
      const data = await fileToDataUrl(values.receipt)
      const result = await api.createPaymentRequest(values.plan, plans[values.plan], data, values.receipt.type)
      if (!result.ok) {
        toast.error(translateApiError(result.error, t))
        return
      }
      setPaymentRows(await api.getMyPayments())
      toast.success(t('paymentPending'))
    } catch {
      toast.error(t('unknownError'))
    } finally {
      setSaving(false)
    }
  }
  if (!paymentsEnabled) return <section className="app-page">
    <header className="page-heading"><div><p className="section-kicker">Accès aux classes</p><h1>{t('subscription')}</h1>
      <p>Les paiements sont désactivés. Les inscriptions acceptées donnent accès aux ressources de la classe.</p></div></header>
    <div className="empty-state"><CreditCard aria-hidden="true"/><h2>Paiements désactivés</h2>
      <p>Aucune formule ni aucun reçu n’est demandé pour le moment.</p></div>
  </section>
  if (pricingScope === 'group') return <section className="app-page">
    <header className="page-heading"><div><p className="section-kicker">Paiement par classe</p><h1>{t('subscription')}</h1>
      <p>Les paiements mensuels se gèrent dans chaque classe acceptée. Consultez le statut et transmettez votre reçu depuis « Mes classes ».</p></div></header>
    <Link className="button-primary" href="/student/groups">Ouvrir Mes classes</Link>
  </section>
  const planLabels = { monthly: t('planMonthly'), quarterly: t('planQuarterly'), annual: t('planAnnual') }
  return <section className="app-page"><header className="page-heading"><div><p className="section-kicker">Accès aux contenus premium</p><h1>{t('subscription')}</h1><p>Choisissez une formule, effectuez le paiement puis envoyez le reçu pour validation.</p></div></header><ol className="payment-stepper"><li className="is-current"><span>1</span><strong>Choisir une formule</strong></li><li><span>2</span><strong>Effectuer le paiement</strong></li><li><span>3</span><strong>Envoyer le reçu</strong></li><li><span>4</span><strong>Validation</strong></li></ol><section className="payment-instructions"><h2>{t('paymentInstructions')}</h2><pre>{instructions}</pre></section><form className="payment-card" onSubmit={handleSubmit(submit)} noValidate>
    <Field label={t('plan')} error={errors.plan?.message}><select {...register('plan')} value={selectedPlan} onChange={(event) => {
      const value = event.target.value as typeof selectedPlan
      setSelectedPlan(value)
      setValue('plan', value)
    }}><option value="monthly">{planLabels.monthly} · {plans.monthly} TND</option><option value="quarterly">{planLabels.quarterly} · {plans.quarterly} TND</option><option value="annual">{planLabels.annual} · {plans.annual} TND</option></select></Field>
    <Field label={t('uploadReceipt')} error={errors.receipt?.message}><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => {
      const file = event.target.files?.[0]
      setReceipt(file)
      if (file) setValue('receipt', file, { shouldValidate: true })
    }}/></Field>
    {receipt && <p>{t('fileChosen')}: {receipt.name}</p>}
    <button className="button-primary" disabled={saving}>{saving ? t('loading') : t('submit')}</button>
  </form><h2>{t('paymentHistory')}</h2>{paymentRows.length ? paymentRows.map((payment) => <article className="result-row" key={payment.id}><b>{planLabels[payment.plan as keyof typeof planLabels] ?? payment.plan}</b><span>{payment.amount} TND · {payment.submittedAt}</span><span className={`payment-status payment-status-${payment.status.toLowerCase()}`}>{payment.status === 'Rejected' ? `${t('rejected')}: ${payment.rejectionReason ?? ''}` : payment.status === 'Pending' ? t('pending') : t('approved')}</span></article>) : <div className="empty-state"><CreditCard aria-hidden="true"/><h2>{t('noData')}</h2><p>Vos demandes de paiement apparaîtront ici.</p></div>}</section>
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('File conversion failed'))
    reader.onerror = () => reject(new Error('File conversion failed'))
    reader.readAsDataURL(file)
  })
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className="form-field">{label}{children}{error && <small role="alert">{error}</small>}</label>
}

'use client'

import { createContext, useContext, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { dictionary, type Language } from '@/lib/i18n'
import { saveLanguagePreference } from '@/lib/api'

type TranslationKey = keyof typeof dictionary.fr
type LanguageContextValue = { lang: Language; t: (key: TranslationKey) => string }
const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void saveLanguagePreference('fr')
  }, [])
  const value = useMemo<LanguageContextValue>(() => ({ lang: 'fr', t: (key) => dictionary.fr[key] }), [])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const value = useContext(LanguageContext)
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider')
  return value
}

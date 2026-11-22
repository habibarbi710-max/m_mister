'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import type { User } from '@/types'
import { authLogout, authSession } from '@/lib/auth'
import { dictionary } from '@/lib/i18n'

type AuthContextValue = {
  user: User | null
  loading: boolean
  setUser: (user: User | null) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  setUser: () => undefined,
  logout: async () => undefined,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void authSession().then(setUser).catch(() => toast.error(dictionary.fr.unknownError)).finally(() => setLoading(false))
  }, [])

  async function logout() {
    await authLogout()
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, loading, setUser, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  api: {
    signIn: vi.fn(),
    signOut: vi.fn(),
    registerUser: vi.fn(),
    getCurrentUser: vi.fn(),
    createTeacherAccount: vi.fn(),
    getAuthCredentials: vi.fn(),
    saveAuthCredentials: vi.fn(),
    addMissingDemoUsers: vi.fn(),
  },
  client: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      updateUser: vi.fn(),
    },
  },
}))

vi.mock('@/lib/api', () => mocks.api)
vi.mock('@/lib/supabase/client', () => ({ getSupabaseBrowserClient: () => mocks.client }))

import { authLogin, authRegister } from '@/lib/auth'

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'
})

afterEach(() => {
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
  if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey
})

describe('Supabase authentication', () => {
  it('authenticates using the submitted email and returns the database profile', async () => {
    const user = {
      id: 'auth-user-1',
      name: 'Sana Ben Ali',
      email: 'sana@example.tn',
      phone: '',
      section: 'Mathématiques',
      sectionId: 'math',
      role: 'student' as const,
    }
    mocks.client.auth.signInWithPassword.mockResolvedValue({ error: null })
    mocks.api.getCurrentUser.mockResolvedValue(user)

    await expect(authLogin('sana@example.tn', 'secure-password')).resolves.toEqual({ ok: true, data: user })
    expect(mocks.client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'sana@example.tn',
      password: 'secure-password',
    })
  })

  it('returns a stable French-facing confirmation state when signup has no session yet', async () => {
    mocks.client.auth.signUp.mockResolvedValue({
      data: { user: { id: 'auth-user-2', email: 'sana@example.tn', phone: null }, session: null },
      error: null,
    })

    const result = await authRegister({
      name: 'Sana Ben Ali',
      email: 'sana@example.tn',
      phone: '',
      password: 'secure-password',
      section: 'Mathématiques',
      sectionId: 'math',
    })

    expect(result).toEqual({
      ok: true,
      requiresConfirmation: true,
      data: {
        id: 'auth-user-2',
        name: 'Sana Ben Ali',
        email: 'sana@example.tn',
        phone: '',
        section: 'Mathématiques',
        sectionId: 'math',
        role: 'student',
      },
    })
    expect(mocks.api.getCurrentUser).not.toHaveBeenCalled()
  })

  it('does not forward raw Supabase login errors', async () => {
    mocks.client.auth.signInWithPassword.mockResolvedValue({
      error: { code: 'invalid_credentials', message: 'Sensitive backend detail' },
    })

    await expect(authLogin('sana@example.tn', 'wrong-password')).resolves.toEqual({
      ok: false,
      error: 'Email or password is incorrect',
    })
  })
})

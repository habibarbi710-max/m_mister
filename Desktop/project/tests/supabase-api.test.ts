import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  client: {
    auth: {
      getSession: vi.fn(),
      getUser: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(),
  },
  rows: {
    profiles: {
      full_name: 'Sana Ben Ali',
      section_id: 'math',
      role: 'student',
      blocked: false,
      avatar_url: null,
    },
    profile_private: { phone: '+216 20 123 456' },
    sections: { name: 'Mathématiques' },
  } as Record<string, unknown>,
}))

vi.mock('@/lib/supabase/client', () => ({ getSupabaseBrowserClient: () => mocks.client }))

import { getCurrentUser } from '@/lib/api'

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'
  mocks.client.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'test' } }, error: null })
  mocks.client.auth.getUser.mockResolvedValue({
    data: { user: { id: 'auth-user-1', email: 'sana@example.tn' } },
    error: null,
  })
  mocks.client.auth.signOut.mockResolvedValue({ error: null })
  mocks.client.from.mockImplementation((table: string) => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: mocks.rows[table] ?? null, error: null }),
    }
    return query
  })
})

afterEach(() => {
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
  if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey
})

describe('Supabase profile loading', () => {
  it('hydrates the current user from the protected profile tables', async () => {
    await expect(getCurrentUser()).resolves.toEqual({
      id: 'auth-user-1',
      name: 'Sana Ben Ali',
      email: 'sana@example.tn',
      phone: '+216 20 123 456',
      section: 'Mathématiques',
      sectionId: 'math',
      role: 'student',
      blocked: false,
      avatarUrl: undefined,
    })
    expect(mocks.client.from.mock.calls.map(([table]) => table)).toEqual([
      'profiles',
      'profile_private',
      'sections',
    ])
  })

  it('does not query profile data when no Supabase session exists', async () => {
    mocks.client.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })

    await expect(getCurrentUser()).resolves.toBeNull()
    expect(mocks.client.auth.getUser).not.toHaveBeenCalled()
    expect(mocks.client.from).not.toHaveBeenCalled()
  })

  it('closes the session for a profile that has been blocked', async () => {
    mocks.rows.profiles = { ...(mocks.rows.profiles as object), blocked: true }

    await expect(getCurrentUser()).resolves.toBeNull()
    expect(mocks.client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(mocks.client.from).toHaveBeenCalledTimes(1)
  })
})

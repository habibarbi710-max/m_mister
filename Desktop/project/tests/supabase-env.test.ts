import { afterEach, describe, expect, it } from 'vitest'
import { getSupabaseEnvironment, requireSupabaseEnvironment } from '@/lib/supabase/env'

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

afterEach(() => {
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
  if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey
})

describe('Supabase environment configuration', () => {
  it('returns no configuration when either public setting is missing', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

    expect(getSupabaseEnvironment()).toBeNull()
  })

  it('requires both the project URL and publishable key', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'

    expect(getSupabaseEnvironment()).toEqual({
      url: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_test',
    })
    expect(requireSupabaseEnvironment()).toEqual(getSupabaseEnvironment())
  })
})

'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireSupabaseEnvironment } from '@/lib/supabase/env'

let browserClient: SupabaseClient | undefined

export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient
  const { url, publishableKey } = requireSupabaseEnvironment()
  browserClient = createBrowserClient(url, publishableKey)
  return browserClient
}

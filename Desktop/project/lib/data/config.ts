import type { DataProvider } from '@/lib/data/provider'
import { localProvider } from '@/lib/data/local-provider'
import { supabaseProvider } from '@/lib/data/supabase-provider'
import { getSupabaseEnvironment } from '@/lib/supabase/env'

export const dataProvider: DataProvider = getSupabaseEnvironment() ? supabaseProvider : localProvider

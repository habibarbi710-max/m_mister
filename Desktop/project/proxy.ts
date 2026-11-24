import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getSupabaseEnvironment } from '@/lib/supabase/env'

export async function proxy(request: NextRequest) {
  const environment = getSupabaseEnvironment()
  if (!environment) return NextResponse.next({ request })

  let response = NextResponse.next({ request })
  const supabase = createServerClient(environment.url, environment.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, cacheHeaders) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        Object.entries(cacheHeaders).forEach(([name, value]) => response.headers.set(name, value))
      },
    },
  })

  await supabase.auth.getClaims()
  return response
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/subjects/:path*',
    '/lessons/:path*',
    '/exams/:path*',
    '/live/:path*',
    '/profile/:path*',
    '/student/:path*',
    '/groups/:path*',
    '/messages/:path*',
    '/notifications/:path*',
    '/teacher/:path*',
    '/admin/:path*',
  ],
}

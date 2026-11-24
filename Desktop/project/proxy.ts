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

  const { data: claims, error } = await supabase.auth.getClaims()
  const pathname = request.nextUrl.pathname
  const publicAuthPage = pathname === '/login' || pathname === '/register'

  if (!error && claims?.claims) return response
  if (publicAuthPage) return response

  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.search = ''
  loginUrl.searchParams.set('return', pathname + (request.nextUrl.search || ''))
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/', '/((?!_next/static|_next/image|favicon.ico).*)'],
}

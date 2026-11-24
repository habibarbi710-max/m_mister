import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getSupabaseEnvironment } from '@/lib/supabase/env'

export async function proxy(request: NextRequest) {
  const privateSiteKey = process.env.PRIVATE_SITE_KEY
  if (privateSiteKey) {
    if (request.nextUrl.searchParams.get('key') === privateSiteKey) {
      request.nextUrl.searchParams.delete('key')
      const response = NextResponse.redirect(request.nextUrl)
      response.cookies.set('private-site-access', '1', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
      })
      return response
    }

    if (request.cookies.get('private-site-access')?.value !== '1') {
      return new NextResponse('Not Found', { status: 404 })
    }
  }

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
  matcher: ['/', '/((?!_next/static|_next/image|favicon.ico).*)'],
}

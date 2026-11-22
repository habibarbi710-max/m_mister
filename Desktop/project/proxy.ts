import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

// FUTURE: replace this pass-through with server-side session validation.
export function proxy(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/subjects/:path*', '/lessons/:path*', '/exams/:path*', '/live/:path*', '/profile/:path*', '/teacher/:path*', '/admin/:path*'],
}

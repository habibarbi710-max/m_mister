import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('authentication proxy', () => {
  const proxy = readFileSync(resolve(process.cwd(), 'proxy.ts'), 'utf8')

  it('allows only login and registration without a Supabase session', () => {
    expect(proxy).toContain("pathname === '/login'")
    expect(proxy).toContain("pathname === '/register'")
  })

  it('redirects protected pages to login with a return URL', () => {
    expect(proxy).toContain("loginUrl.pathname = '/login'")
    expect(proxy).toContain("loginUrl.searchParams.set('return'")
  })

  it('does not expose the old private-key bypass', () => {
    expect(proxy).not.toContain('PRIVATE_SITE_KEY')
    expect(proxy).not.toContain('private-site-access')
  })
})

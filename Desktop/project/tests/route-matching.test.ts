import { describe, expect, it } from 'vitest'
import { matchesRoute } from '@/lib/route-matching'

describe('route matching', () => {
  it('matches a route and its nested paths without matching similarly prefixed routes', () => {
    expect(matchesRoute('/teacher', '/teacher')).toBe(true)
    expect(matchesRoute('/teacher/groups', '/teacher')).toBe(true)
    expect(matchesRoute('/teachers', '/teacher')).toBe(false)
  })
})

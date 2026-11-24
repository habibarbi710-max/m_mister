import { describe, expect, it } from 'vitest'
import { translateApiError } from '@/components/shared/api-error'
import { dictionary } from '@/lib/i18n'
import { API_ERROR_CODES, getApiErrorCode } from '@/lib/api'

describe('API error translations', () => {
  it('uses French translations for live-session authorization errors', () => {
    const t = (key: keyof typeof dictionary.fr) => dictionary.fr[key]

    expect(translateApiError('Student permission required', t)).toBe(dictionary.fr.permissionError)
    expect(translateApiError('The live session has not started', t)).toBe(dictionary.fr.sessionError)
  })

  it('normalizes legacy API messages to stable codes and translates every code to French', () => {
    const t = (key: keyof typeof dictionary.fr) => dictionary.fr[key]
    const codes = Object.values(API_ERROR_CODES)

    expect(getApiErrorCode('This account is blocked')).toBe(API_ERROR_CODES.PERMISSION_DENIED)
    expect(getApiErrorCode('La limite de messages et questions par heure est atteinte.')).toBe(API_ERROR_CODES.RATE_LIMITED)
    expect(codes.every((code) => translateApiError(code, t).length > 0)).toBe(true)
    expect(translateApiError('unmapped raw database failure', t)).toBe(dictionary.fr.unknownError)
  })
})

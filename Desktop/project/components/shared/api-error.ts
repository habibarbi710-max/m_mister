import { dictionary } from '@/lib/i18n'
import { API_ERROR_CODES, getApiErrorCode, type ApiErrorCode } from '@/lib/api'
import { toast } from 'sonner'

type TranslationKey = keyof typeof dictionary.fr
type Translate = (key: TranslationKey) => string

const errorKeys: Record<ApiErrorCode, TranslationKey> = {
  [API_ERROR_CODES.AUTH_REQUIRED]: 'loginRequired',
  [API_ERROR_CODES.PERMISSION_DENIED]: 'permissionError',
  [API_ERROR_CODES.NOT_FOUND]: 'notFound',
  [API_ERROR_CODES.INVALID_INPUT]: 'invalidFields',
  [API_ERROR_CODES.PAYMENT_REQUIRED]: 'paymentStateError',
  [API_ERROR_CODES.PAYMENTS_DISABLED]: 'paymentsDisabled',
  [API_ERROR_CODES.RATE_LIMITED]: 'rateLimitError',
  [API_ERROR_CODES.DUPLICATE]: 'duplicateEmail',
  [API_ERROR_CODES.INVALID_STATE]: 'sessionError',
  [API_ERROR_CODES.STORAGE_FAILURE]: 'unknownError',
  [API_ERROR_CODES.UNKNOWN]: 'unknownError',
}

export function translateApiError(message: string, t: Translate): string {
  return t(errorKeys[getApiErrorCode(message)])
}

export function showApiError(message: string): void {
  toast.error(dictionary.fr[errorKeys[getApiErrorCode(message)]])
}

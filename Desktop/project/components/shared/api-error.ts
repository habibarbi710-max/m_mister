import type { dictionary } from '@/lib/i18n'

type TranslationKey = keyof typeof dictionary.fr
type Translate = (key: TranslationKey) => string

const errorKeys: Record<string, TranslationKey> = {
  'Unsupported receipt format': 'receiptError',
  'Receipt must be a valid encoded image or PDF': 'receiptError',
  'Receipt exceeds the 3 MB limit': 'receiptError',
  'You must be logged in': 'loginRequired',
  'This account is blocked': 'accountBlocked',
  'Selected plan price is invalid': 'priceError',
  'Admin permission required': 'permissionError',
  'Teacher permission required': 'permissionError',
  'A rejection reason of at least five characters is required': 'reasonError',
  'You can only edit your own sessions': 'ownershipError',
  'You can only edit your own lessons': 'ownershipError',
  'You can only publish lessons under your own account': 'ownershipError',
  'You can only delete your own lessons': 'ownershipError',
  'You can only reorder your own lessons': 'ownershipError',
  'You can only edit your own exam entries': 'ownershipError',
  'You can only delete your own exam entries': 'ownershipError',
  'Video URL must be a valid YouTube, Vimeo or Bunny URL': 'videoError',
  'PDF must be uploaded as a validated PDF file': 'pdfError',
  'Assign this lesson to an existing subject and chapter': 'chapterError',
  'This subject is not assigned to your account': 'subjectError',
  'Monthly price must be greater than zero': 'invalidSetting',
  'Monthly price and payment instructions are invalid': 'invalidSetting',
  'Invalid teacher details': 'invalidFields',
  'Invalid live session details': 'sessionError',
  'Pending payment not found': 'paymentStateError',
  'Student permission required': 'permissionError',
  'Invalid exam details': 'invalidFields',
  'Invalid lesson details': 'invalidFields',
  'This email is already registered': 'duplicateEmail',
  'This email or phone is already registered': 'duplicateEmail',
  'Teacher not found': 'unknownError',
  'Unknown subject': 'subjectError',
}

export function translateApiError(message: string, t: Translate): string {
  return t(errorKeys[message] ?? 'unknownError')
}

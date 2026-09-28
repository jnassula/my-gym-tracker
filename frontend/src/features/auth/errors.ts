import type { ParseKeys, TFunction } from 'i18next'

import pt from '@/i18n/locales/pt.json'
import { ApiError, NetworkError } from '@/lib/api'

type ErrorCode = keyof typeof pt.errors
export type ErrorKey = `errors.${ErrorCode}`

function isKnownCode(code: string): code is ErrorCode {
  return code in pt.errors
}

/** Translation key for an API or network error, chosen by its `code`. */
export function errorKey(error: unknown): ErrorKey {
  const code = error instanceof ApiError || error instanceof NetworkError ? error.code : 'unknown'
  return `errors.${isKnownCode(code) ? code : 'unknown'}`
}

/**
 * Every form error message is a translation key: zod messages ("validation.email") and
 * server errors set with setError ("errors.email_taken"). Translating at render time keeps
 * them in the current language.
 */
export function fieldMessage(t: TFunction, key: string | undefined): string | undefined {
  return key ? t(key as ParseKeys) : undefined
}

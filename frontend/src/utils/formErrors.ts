import type { ApiRequestError } from '../api/apiClient'
import type { FieldErrors } from './validation'

const FALLBACK_ERROR_MESSAGE = 'Something went wrong'

/** The message of an Error, or a fixed fallback; never anything else (no raw objects reach the UI). */
export function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : FALLBACK_ERROR_MESSAGE
}

/** Server field errors restricted to the known form fields (first message per field wins). */
export function fieldErrorsFrom<K extends string>(error: ApiRequestError, fields: readonly K[]): FieldErrors<K> {
  const result: FieldErrors<K> = {}
  for (const field of fields) {
    const message = error.fieldMessage(field)
    if (message !== undefined) result[field] = message
  }
  return result
}

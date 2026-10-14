import { describe, expect, it } from 'vitest'
import { ApiRequestError } from '../api/apiClient'
import { errorMessageOf, fieldErrorsFrom } from './formErrors'

describe('fieldErrorsFrom', () => {
  it('keeps the first message per known field and ignores unknown fields', () => {
    const error = new ApiRequestError(400, 'Validation failed', [
      { field: 'title', message: 'A' },
      { field: 'title', message: 'B' },
      { field: 'dueAt', message: 'C' },
      { field: 'foo', message: 'D' },
    ])
    expect(fieldErrorsFrom(error, ['title', 'dueAt'])).toEqual({ title: 'A', dueAt: 'C' })
  })

  it('returns an empty object without matching field errors', () => {
    expect(fieldErrorsFrom(new ApiRequestError(400, 'Bad'), ['title'])).toEqual({})
    expect(fieldErrorsFrom(new ApiRequestError(400, 'Bad', [{ field: 'foo', message: 'D' }]), ['title'])).toEqual({})
  })
})

describe('errorMessageOf', () => {
  it('uses the Error message and a fixed fallback for anything else', () => {
    expect(errorMessageOf(new Error('x'))).toBe('x')
    expect(errorMessageOf('boom')).toBe('Something went wrong')
    expect(errorMessageOf(undefined)).toBe('Something went wrong')
  })
})

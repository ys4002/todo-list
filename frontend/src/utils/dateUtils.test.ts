import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isOverdue, toDateTimeLocalValue, toIsoUtc } from './dateUtils'

describe('dateUtils', () => {
  const originalTz = process.env.TZ
  beforeAll(() => {
    process.env.TZ = 'Asia/Kolkata'
  })
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ
    else process.env.TZ = originalTz
  })

  it('converts a datetime-local value in +05:30 to UTC ISO', () => {
    expect(toIsoUtc('2026-10-10T22:30')).toBe('2026-10-10T17:00:00.000Z')
  })

  it('round-trips between ISO and datetime-local values', () => {
    expect(toDateTimeLocalValue('2026-10-10T17:00:00Z')).toBe('2026-10-10T22:30')
    expect(toDateTimeLocalValue(toIsoUtc('2026-03-05T09:07'))).toBe('2026-03-05T09:07')
  })

  it('isOverdue is true only for open tasks in the past', () => {
    const now = Date.parse('2026-10-10T12:00:00Z')
    expect(isOverdue({ dueAt: '2026-10-10T11:00:00Z', completed: false }, now)).toBe(true)
    expect(isOverdue({ dueAt: '2026-10-10T11:00:00Z', completed: true }, now)).toBe(false)
    expect(isOverdue({ dueAt: '2026-10-10T13:00:00Z', completed: false }, now)).toBe(false)
  })
})

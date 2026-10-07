import { describe, expect, it } from 'vitest'
import {
  messages,
  passwordRules,
  validateChangePassword,
  validateNewPassword,
  validateRegister,
  validateResetPassword,
  validateTask,
  validateUsername,
} from './validation'

describe('password strength (U4/U19)', () => {
  it.each([
    ['Str0ng!Pass', true],
    ['Sh0rt!', false],
    ['str0ng!pass', false],
    ['STR0NG!PASS', false],
    ['Strong!Pass', false],
    ['Str0ngPass1', false],
    ['Str0ng !Pass', false],
    ['Aa1!' + 'x'.repeat(61), false],
  ])('%s -> valid=%s', (password, valid) => {
    expect(validateNewPassword(password, 'someone')).toBe(valid ? null : messages.passwordStrength)
  })

  it('rejects a password containing the username, case-insensitively (U5)', () => {
    expect(validateNewPassword('Alice_01!x', 'alice_01')).toBe(messages.passwordHasUsername)
    expect(validateNewPassword('xALICE_01!9', 'alice_01')).toBe(messages.passwordHasUsername)
    expect(validateNewPassword('N3w#Secret', 'alice_01')).toBeNull()
  })

  it('checklist ticks live', () => {
    const ids = (pw: string) => passwordRules(pw, 'bob').filter((r) => r.passed).map((r) => r.id)
    expect(ids('')).toEqual([])
    expect(ids('Str0ng!Pass')).toEqual(['length', 'upper', 'lower', 'digit', 'special', 'noSpaces', 'noUsername'])
    expect(ids('xBOBx')).not.toContain('noUsername')
  })
})

describe('username rule', () => {
  it.each(['ab', 'a'.repeat(31), '1abc', 'bad name', 'al!ce'])('rejects %s', (name) => {
    expect(validateUsername(name)).toBe(messages.usernameFormat)
  })
  it('requires a value and accepts valid names', () => {
    expect(validateUsername('  ')).toBe(messages.usernameRequired)
    expect(validateUsername('Alice_01')).toBeNull()
  })
})

describe('validateRegister', () => {
  it('flags every empty field', () => {
    const errors = validateRegister({ username: '', name: '', password: '', confirmPassword: '' })
    expect(Object.keys(errors).sort()).toEqual(['confirmPassword', 'name', 'password', 'username'])
  })
  it('flags mismatched confirmation (U3)', () => {
    const errors = validateRegister({
      username: 'alice_01', name: 'Alice', password: 'Str0ng!Pass', confirmPassword: 'other',
    })
    expect(errors).toEqual({ confirmPassword: messages.confirmMismatch })
  })
  it('accepts valid input', () => {
    expect(
      validateRegister({ username: 'alice_01', name: 'Alice', password: 'Str0ng!Pass', confirmPassword: 'Str0ng!Pass' }),
    ).toEqual({})
  })
})

describe('validateChangePassword (U24)', () => {
  const ok = { currentPassword: 'Str0ng!Pass', newPassword: 'N3w#Secret', confirmNewPassword: 'N3w#Secret' }
  it('requires current password', () => {
    expect(validateChangePassword({ ...ok, currentPassword: '' }, 'alice_01').currentPassword).toBe(
      messages.currentPasswordRequired,
    )
  })
  it('rejects weak new password', () => {
    expect(validateChangePassword({ ...ok, newPassword: 'weak', confirmNewPassword: 'weak' }, 'alice_01').newPassword).toBe(
      messages.passwordStrength,
    )
  })
  it('rejects mismatched confirmation', () => {
    expect(validateChangePassword({ ...ok, confirmNewPassword: 'x' }, 'alice_01').confirmNewPassword).toBe(
      messages.confirmMismatch,
    )
  })
  it('rejects new = current', () => {
    const same = { currentPassword: 'Str0ng!Pass', newPassword: 'Str0ng!Pass', confirmNewPassword: 'Str0ng!Pass' }
    expect(validateChangePassword(same, 'alice_01').newPassword).toBe(messages.newPasswordSameAsCurrent)
  })
  it('passes valid input', () => {
    expect(validateChangePassword(ok, 'alice_01')).toEqual({})
  })
})

describe('validateResetPassword', () => {
  it('does not apply the differs-from-current rule and checks the target username', () => {
    expect(validateResetPassword({ newPassword: 'N3w#Secret', confirmNewPassword: 'N3w#Secret' }, 'alice_01')).toEqual({})
    expect(
      validateResetPassword({ newPassword: 'Alice_01!x', confirmNewPassword: 'Alice_01!x' }, 'alice_01').newPassword,
    ).toBe(messages.passwordHasUsername)
  })
})

describe('validateTask', () => {
  const now = Date.parse('2026-10-10T12:00:00')
  it('reports empty title and missing due date', () => {
    const errors = validateTask({ title: ' ', description: '', dueAtLocal: '' }, 'create', now)
    expect(errors).toEqual({ title: messages.titleRequired, dueAt: messages.dueRequired })
  })
  it('rejects a past due date on create beyond the 5 minute grace, allows it on edit', () => {
    const past = { title: 't', description: '', dueAtLocal: '2026-10-10T10:00' }
    expect(validateTask(past, 'create', now).dueAt).toBe(messages.duePast)
    expect(validateTask(past, 'edit', now)).toEqual({})
    expect(validateTask({ ...past, dueAtLocal: '2026-10-10T11:57' }, 'create', now)).toEqual({})
  })
  it('enforces length limits', () => {
    const errors = validateTask(
      { title: 'a'.repeat(101), description: 'b'.repeat(1001), dueAtLocal: '2027-01-01T10:00' },
      'create',
      now,
    )
    expect(errors).toEqual({ title: messages.titleTooLong, description: messages.descriptionTooLong })
  })
})

// Mirrors section 3.2 of docs/plan.md, with the same messages as the server.

export type FieldErrors<K extends string = string> = Partial<Record<K, string>>

export const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{2,29}$/
export const CREATE_GRACE_MS = 5 * 60 * 1000

export const messages = {
  usernameRequired: 'Username is required',
  usernameFormat:
    "Username must be 3-30 characters, start with a letter, and use only letters, digits, '.', '_' or '-'",
  nameRequired: 'Name is required',
  nameTooLong: 'Name must be at most 100 characters',
  passwordRequired: 'Password is required',
  passwordStrength:
    'Password must be 8-64 characters with no spaces and include an upper-case letter, a lower-case letter, a digit and a special character',
  passwordHasUsername: 'Password must not contain the username',
  confirmRequired: 'Confirm password is required',
  confirmMismatch: 'Passwords do not match',
  currentPasswordRequired: 'Current password is required',
  newPasswordSameAsCurrent: 'New password must be different from the current password',
  confirmNewRequired: 'Confirm new password is required',
  titleRequired: 'Title is required',
  titleTooLong: 'Title must be at most 100 characters',
  descriptionTooLong: 'Description must be at most 1000 characters',
  dueRequired: 'Due date and time is required',
  duePast: 'Due date and time cannot be in the past',
} as const

export interface PasswordRule {
  id: 'length' | 'upper' | 'lower' | 'digit' | 'special' | 'noSpaces' | 'noUsername'
  label: string
  passed: boolean
}

/** Live checklist for PasswordRulesChecklist. */
export function passwordRules(password: string, username: string): PasswordRule[] {
  const name = username.trim().toLowerCase()
  return [
    { id: 'length', label: '8-64 characters', passed: password.length >= 8 && password.length <= 64 },
    { id: 'upper', label: 'An upper-case letter', passed: /\p{Lu}/u.test(password) },
    { id: 'lower', label: 'A lower-case letter', passed: /\p{Ll}/u.test(password) },
    { id: 'digit', label: 'A digit', passed: /\p{Nd}/u.test(password) },
    { id: 'special', label: 'A special character', passed: /[^\p{L}\p{N}\s]/u.test(password) },
    { id: 'noSpaces', label: 'No spaces', passed: password.length > 0 && !/\s/.test(password) },
    {
      id: 'noUsername',
      label: 'Does not contain the username',
      passed: password.length > 0 && !(name && password.toLowerCase().includes(name)),
    },
  ]
}

export function isStrongPassword(password: string): boolean {
  return passwordRules(password, '')
    .filter((rule) => rule.id !== 'noUsername')
    .every((rule) => rule.passed)
}

export function validateUsername(username: string): string | null {
  const value = username.trim()
  if (!value) return messages.usernameRequired
  return USERNAME_PATTERN.test(value) ? null : messages.usernameFormat
}

function containsUsername(password: string, username: string): boolean {
  const name = username.trim().toLowerCase()
  return name !== '' && password.toLowerCase().includes(name)
}

/** Strength, then must-not-contain-username. Returns the first failing message. */
export function validateNewPassword(password: string, username: string): string | null {
  if (!isStrongPassword(password)) return messages.passwordStrength
  if (containsUsername(password, username)) return messages.passwordHasUsername
  return null
}

export type LoginField = 'username' | 'password'

export function validateLogin(values: Record<LoginField, string>): FieldErrors<LoginField> {
  const errors: FieldErrors<LoginField> = {}
  if (!values.username.trim()) errors.username = messages.usernameRequired
  if (!values.password) errors.password = messages.passwordRequired
  return errors
}

export type RegisterField = 'username' | 'name' | 'password' | 'confirmPassword'

export function validateRegister(values: Record<RegisterField, string>): FieldErrors<RegisterField> {
  const errors: FieldErrors<RegisterField> = {}
  const usernameError = validateUsername(values.username)
  if (usernameError) errors.username = usernameError
  const name = values.name.trim()
  if (!name) errors.name = messages.nameRequired
  else if (name.length > 100) errors.name = messages.nameTooLong
  const passwordError = validateNewPassword(values.password, values.username)
  if (passwordError) errors.password = passwordError
  if (!values.confirmPassword) errors.confirmPassword = messages.confirmRequired
  else if (values.confirmPassword !== values.password) errors.confirmPassword = messages.confirmMismatch
  return errors
}

export type ChangePasswordField = 'currentPassword' | 'newPassword' | 'confirmNewPassword'

export function validateChangePassword(
  values: Record<ChangePasswordField, string>,
  username: string,
): FieldErrors<ChangePasswordField> {
  const errors: FieldErrors<ChangePasswordField> = {}
  if (!values.currentPassword) errors.currentPassword = messages.currentPasswordRequired
  const newError = validateNewPassword(values.newPassword, username)
  if (newError) errors.newPassword = newError
  else if (values.currentPassword && values.newPassword === values.currentPassword) {
    errors.newPassword = messages.newPasswordSameAsCurrent
  }
  if (!values.confirmNewPassword) errors.confirmNewPassword = messages.confirmNewRequired
  else if (values.confirmNewPassword !== values.newPassword) errors.confirmNewPassword = messages.confirmMismatch
  return errors
}

export type ResetPasswordField = 'newPassword' | 'confirmNewPassword'

/** Admin reset: no current password, no "differs from current" rule. */
export function validateResetPassword(
  values: Record<ResetPasswordField, string>,
  targetUsername: string,
): FieldErrors<ResetPasswordField> {
  const errors: FieldErrors<ResetPasswordField> = {}
  const newError = validateNewPassword(values.newPassword, targetUsername)
  if (newError) errors.newPassword = newError
  if (!values.confirmNewPassword) errors.confirmNewPassword = messages.confirmNewRequired
  else if (values.confirmNewPassword !== values.newPassword) errors.confirmNewPassword = messages.confirmMismatch
  return errors
}

export type TaskField = 'title' | 'description' | 'dueAt'

export function validateTask(
  values: { title: string; description: string; dueAtLocal: string },
  mode: 'create' | 'edit',
  now: number = Date.now(),
): FieldErrors<TaskField> {
  const errors: FieldErrors<TaskField> = {}
  const title = values.title.trim()
  if (!title) errors.title = messages.titleRequired
  else if (title.length > 100) errors.title = messages.titleTooLong
  if (values.description.length > 1000) errors.description = messages.descriptionTooLong
  if (!values.dueAtLocal) errors.dueAt = messages.dueRequired
  else {
    const due = new Date(values.dueAtLocal).getTime()
    if (Number.isNaN(due)) errors.dueAt = messages.dueRequired
    else if (mode === 'create' && due < now - CREATE_GRACE_MS) errors.dueAt = messages.duePast
  }
  return errors
}

import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiRequestError } from '../api/apiClient'
import { authApi } from '../api/authApi'
import { useAuth } from '../auth/AuthContext'
import type { ChangePasswordField } from '../utils/validation'
import { validateChangePassword } from '../utils/validation'
import type { FieldErrors } from '../utils/validation'
import ErrorBanner from './ErrorBanner'
import FormField from './FormField'
import PasswordRulesChecklist from './PasswordRulesChecklist'

const empty = { currentPassword: '', newPassword: '', confirmNewPassword: '' }

export default function ChangePasswordForm({ username }: { username: string }) {
  const { renewSession } = useAuth()
  const [values, setValues] = useState(empty)
  const [errors, setErrors] = useState<FieldErrors<ChangePasswordField>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pending, setPending] = useState(false)

  const setField = (field: ChangePasswordField) => (value: string) => setValues((v) => ({ ...v, [field]: value }))

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSuccess(false)
    setFormError(null)
    const clientErrors = validateChangePassword(values, username)
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length > 0) return

    setPending(true)
    try {
      const response = await authApi.changePassword(values)
      renewSession(response.token, response.expiresIn)
      setValues(empty)
      setSuccess(true)
    } catch (error) {
      if (error instanceof ApiRequestError && error.fieldErrors.length > 0) {
        const serverErrors: FieldErrors<ChangePasswordField> = {}
        for (const item of error.fieldErrors) {
          const field = item.field as ChangePasswordField
          if (field in empty && !serverErrors[field]) serverErrors[field] = item.message
        }
        setErrors(serverErrors)
        if (Object.keys(serverErrors).length === 0) setFormError(error.message)
      } else {
        setFormError(error instanceof Error ? error.message : 'Something went wrong')
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Change password">
      <h2>Change password</h2>
      {success && (
        <p role="status" className="success-banner">
          Password changed
        </p>
      )}
      <ErrorBanner message={formError} />
      <FormField
        id="currentPassword"
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={values.currentPassword}
        onValueChange={setField('currentPassword')}
        error={errors.currentPassword}
      />
      <FormField
        id="newPassword"
        label="New password"
        type="password"
        autoComplete="new-password"
        value={values.newPassword}
        onValueChange={setField('newPassword')}
        error={errors.newPassword}
      />
      <PasswordRulesChecklist password={values.newPassword} username={username} />
      <FormField
        id="confirmNewPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        value={values.confirmNewPassword}
        onValueChange={setField('confirmNewPassword')}
        error={errors.confirmNewPassword}
      />
      <button type="submit" className="primary" disabled={pending}>
        Change password
      </button>
    </form>
  )
}

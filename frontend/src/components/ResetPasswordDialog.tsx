import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiRequestError } from '../api/apiClient'
import { adminApi } from '../api/adminApi'
import type { AdminUser } from '../api/types'
import { useModalDialog } from '../hooks/useModalDialog'
import { errorMessageOf, fieldErrorsFrom } from '../utils/formErrors'
import { validateResetPassword } from '../utils/validation'
import type { FieldErrors, ResetPasswordField } from '../utils/validation'
import ErrorBanner from './ErrorBanner'
import FormField from './FormField'
import PasswordRulesChecklist from './PasswordRulesChecklist'

const resetPasswordFields: ResetPasswordField[] = ['newPassword', 'confirmNewPassword']

interface Props {
  user: AdminUser
  onClose: () => void
  onSuccess: (username: string) => void
}

export default function ResetPasswordDialog({ user, onClose, onSuccess }: Props) {
  const [values, setValues] = useState<Record<ResetPasswordField, string>>({ newPassword: '', confirmNewPassword: '' })
  const [errors, setErrors] = useState<FieldErrors<ResetPasswordField>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useModalDialog(onClose)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const clientErrors = validateResetPassword(values, user.username)
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length > 0) return

    setPending(true)
    try {
      await adminApi.resetUserPassword(user.id, values)
      onSuccess(user.username)
    } catch (error) {
      setPending(false)
      if (error instanceof ApiRequestError && error.fieldErrors.length > 0) {
        const serverErrors = fieldErrorsFrom(error, resetPasswordFields)
        setErrors(serverErrors)
        if (Object.keys(serverErrors).length === 0) setFormError(error.message)
      } else {
        setFormError(errorMessageOf(error))
      }
    }
  }

  return (
    <div className="dialog-backdrop">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-title"
        className="card dialog"
        onSubmit={handleSubmit}
        noValidate
      >
        <h2 id="reset-title">Reset password for {user.username}</h2>
        <ErrorBanner message={formError} />
        <FormField
          id="resetNewPassword"
          label="New password"
          type="password"
          autoComplete="new-password"
          autoFocus
          value={values.newPassword}
          onValueChange={(newPassword) => setValues((v) => ({ ...v, newPassword }))}
          error={errors.newPassword}
        />
        <PasswordRulesChecklist password={values.newPassword} username={user.username} />
        <FormField
          id="resetConfirmNewPassword"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={values.confirmNewPassword}
          onValueChange={(confirmNewPassword) => setValues((v) => ({ ...v, confirmNewPassword }))}
          error={errors.confirmNewPassword}
        />
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={pending}>
            Reset password
          </button>
        </div>
      </form>
    </div>
  )
}
